// =====================================================================
//  Motor de salas y tandas de penaltis. El servidor es la única autoridad:
//  guarda las decisiones ocultas, resuelve cada lanzamiento y reparte premios.
// =====================================================================
import crypto from 'node:crypto';
import { MATCH, SHOT } from './config.js';
import * as game from './game.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------------------------------------------------------------------
//  Reglas de resolución (funciones puras, documentadas en el README).
//  Orden de tiradas aleatorias: 1) variación de potencia, 2) fuera,
//  3) parada (si el portero adivina) — o en la segunda estirada, 3) parada.
// ---------------------------------------------------------------------
export function shotPower(shooter, rnd) {
  const [lo, hi] = SHOT.powerJitter;
  return clamp(Math.round(shooter.stats.potencia + lo + rnd * (hi - lo)), 1, 99);
}

export function missChance(shooter, zone) {
  const row = Math.floor(zone / 2);
  return clamp(SHOT.missBase[row] * (110 - shooter.stats.precision) / 50, 0, 0.4);
}

export function saveChance(shooter, keeper, zone, power) {
  const s = SHOT.save;
  const row = Math.floor(zone / 2);
  const p = s.base
    + (keeper.stats.parada - 50) * s.perParada
    + (keeper.stats.reflejos - 50) * s.perReflejos
    + (power - 50) * s.perPotencia
    + (shooter.stats.calidad - 50) * s.perCalidad
    + s.rowBonus[row];
  return clamp(p, s.min, s.max);
}

// Doble parada: solo porteros buenos (oro o superior), y aun así con una probabilidad (40 %).
export function canDoubleSave(keeper) {
  return SHOT.second.tiers.includes(keeper.tier);
}

// Comprueba si la tanda ha terminado. Devuelve el lado ganador (0/1) o null.
export function shootoutWinner(kicks, perTeam = MATCH.kicksPerTeam) {
  const n = [0, 0], g = [0, 0];
  for (const k of kicks) { n[k.side]++; if (k.outcome === 'gol') g[k.side]++; }
  if (n[0] <= perTeam && n[1] <= perTeam) {
    if (g[0] > g[1] + (perTeam - n[1])) return 0;
    if (g[1] > g[0] + (perTeam - n[0])) return 1;
    return null;
  }
  // Muerte súbita: se decide al completar cada pareja de lanzamientos.
  if (n[0] === n[1] && g[0] !== g[1]) return g[0] > g[1] ? 0 : 1;
  return null;
}

export function createMatchManager({ io, db, rng = Math.random, timing = MATCH }) {
  const rooms = new Map();     // código -> sala
  const userRoom = new Map();  // userId -> código
  const online = new Map();    // userId -> nº de sockets abiertos
  const T = { ...MATCH, ...timing };
  let random = rng;

  const now = () => Date.now();
  const emitTo = (userId, ev, data) => io.to(`u:${userId}`).emit(ev, data);
  const isOnline = (id) => (online.get(id) || 0) > 0;

  function newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 6; i++) c += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
  }

  function clearTimer(room) { if (room.timer) { clearTimeout(room.timer); room.timer = null; } }
  function setTimer(room, ms, fn) { clearTimer(room); room.timer = setTimeout(() => { room.timer = null; fn(); }, ms); }

  function cardView(c) {
    return c && { id: c.id, name: c.name, type: c.type, rating: c.rating, tier: c.tier, position: c.position, stats: c.stats, nation: c.nation };
  }

  function score(room) {
    const g = [0, 0];
    for (const k of room.kicks) if (k.outcome === 'gol') g[k.side]++;
    return g;
  }

  // Estado visible para un jugador concreto: nunca incluye la decisión pendiente del rival.
  function view(room, viewerId) {
    const you = room.order.indexOf(viewerId);
    const players = room.order.map((id) => {
      const p = room.players[id];
      return p && {
        id: p.id, name: p.name, crest: p.crest, shooter: cardView(p.shooter), keeper: cardView(p.keeper),
        connected: isOnline(p.id), disconnectedLeftMs: p.discDeadline ? Math.max(0, p.discDeadline - now()) : null,
      };
    });
    let cur = null;
    if (room.cur) {
      const c = room.cur;
      const shooterId = room.order[c.side];
      const role = viewerId === shooterId ? 'shoot' : 'save';
      cur = {
        side: c.side, phase: c.phase, role, paused: !!c.paused,
        leftMs: c.paused ? c.pausedRemaining : Math.max(0, (c.deadline || 0) - now()),
        youChose: role === 'shoot' ? c.shot != null : c.dive != null,
        opponentChose: role === 'shoot' ? c.dive != null : c.shot != null,
        yourChoice: role === 'shoot' ? c.shot : c.dive,
      };
      if (c.phase === 'second') {
        cur.firstDive = c.dive;
        cur.windowMs = c.windowMs;
        cur.minigameMs = T.minigameMs ?? SHOT.second.minigameMs;
        cur.diveMs = T.diveMs ?? SHOT.second.diveMs;
        cur.circles = SHOT.second.patternCircles;
        cur.introMs = T.secondPhaseIntroMs;
        if (role === 'shoot') cur.yourChoice = c.shot;
      }
    }
    const n = room.kicks.length;
    return {
      code: room.code, status: room.status, you, players,
      score: score(room),
      kicks: room.kicks.map((k) => ({ side: k.side, zone: k.zone, dive: k.dive, dive2: k.dive2, outcome: k.outcome, second: k.second })),
      round: Math.floor(n / 2) + 1,
      suddenDeath: n >= T.kicksPerTeam * 2,
      cur,
      startsInMs: room.status === 'starting' ? Math.max(0, room.startAt - now()) : null,
      result: room.result ? { ...room.result, rewards: room.result.rewards?.[viewerId] || null } : null,
    };
  }

  function broadcast(room) {
    for (const id of room.order) if (id) emitTo(id, 'room:state', view(room, id));
  }

  // ---------------- Ciclo de vida de la sala ----------------
  async function createRoom(user) {
    if (userRoom.has(user.id)) throw new game.GameError('Ya estás en una sala');
    const lineup = await game.getLineup(db, user.id);
    if (!lineup) throw new game.GameError('Necesitas un lanzador y un portero en tu alineación. ¡Abre un sobre en la tienda!');
    const room = {
      code: newCode(), status: 'waiting', createdAt: now(), order: [user.id, null], kicks: [], cur: null,
      players: { [user.id]: { id: user.id, name: user.username, crest: user.crest } },
    };
    rooms.set(room.code, room);
    userRoom.set(user.id, room.code);
    room.expireTimer = setTimeout(() => { if (room.status === 'waiting') closeRoom(room, 'La sala ha caducado'); }, T.waitingRoomTtlMs);
    broadcast(room);
    return room.code;
  }

  async function joinRoom(user, rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    const current = userRoom.get(user.id);
    if (current === code) { broadcast(rooms.get(code)); return code; }
    if (current) throw new game.GameError('Ya estás en otra sala');
    const room = rooms.get(code);
    if (!room || room.status === 'closed') throw new game.GameError('No existe ninguna sala con ese código', 404);
    if (room.status !== 'waiting' || room.order[1]) throw new game.GameError('La sala ya está completa');
    const lineup = await game.getLineup(db, user.id);
    if (!lineup) throw new game.GameError('Necesitas un lanzador y un portero en tu alineación. ¡Abre un sobre en la tienda!');
    if (room.status !== 'waiting' || room.order[1]) throw new game.GameError('La sala ya está completa');
    room.order[1] = user.id;
    room.players[user.id] = { id: user.id, name: user.username, crest: user.crest };
    userRoom.set(user.id, code);
    await startMatch(room);
    return code;
  }

  async function startMatch(room) {
    clearTimeout(room.expireTimer);
    const [a, b] = room.order;
    const [la, lb] = await Promise.all([game.getLineup(db, a), game.getLineup(db, b)]);
    if (!la || !lb) { closeRoom(room, 'Un jugador no tiene alineación válida'); return; }
    Object.assign(room.players[a], la);
    Object.assign(room.players[b], lb);
    room.id = crypto.randomUUID();
    await game.startMatchRecord(db, { id: room.id, code: room.code, home: room.players[a], away: room.players[b] });
    room.status = 'starting';
    room.startAt = now() + T.startCountdownMs;
    for (const id of room.order) if (!isOnline(id)) markDisconnected(room, id);
    broadcast(room);
    setTimer(room, T.startCountdownMs, () => { room.status = 'playing'; startKick(room); });
  }

  function closeRoom(room, reason) {
    clearTimer(room);
    clearTimeout(room.expireTimer);
    for (const p of Object.values(room.players)) clearTimeout(p.discTimer);
    room.status = 'closed';
    for (const id of room.order) {
      if (!id) continue;
      if (userRoom.get(id) === room.code) userRoom.delete(id);
      emitTo(id, 'room:closed', { code: room.code, reason });
    }
    rooms.delete(room.code);
  }

  // ---------------- Lanzamientos ----------------
  function anyDisconnected(room) { return room.order.some((id) => id && !isOnline(id)); }

  function startKick(room) {
    if (room.status !== 'playing') return;
    const side = room.kicks.length % 2;
    room.cur = { side, phase: 'choose', shot: null, dive: null, dive2: null, marked: {}, deadline: now() + T.chooseMs };
    if (anyDisconnected(room)) {
      room.cur.paused = true;
      room.cur.pausedRemaining = T.chooseMs;
    } else {
      setTimer(room, T.chooseMs, () => onChooseTimeout(room));
    }
    broadcast(room);
  }

  function onChooseTimeout(room) {
    const c = room.cur;
    if (!c || c.phase !== 'choose' || room.status !== 'playing') return;
    // Quien no elige a tiempo recibe una elección aleatoria. Tres tiempos agotados seguidos = abandono.
    for (const [key, uid] of [['shot', room.order[c.side]], ['dive', room.order[1 - c.side]]]) {
      if (c[key] == null && c.marked?.[key] != null) { c[key] = c.marked[key]; continue; }
      if (c[key] == null) {
        c[key] = crypto.randomInt(0, 6);
        const p = room.players[uid];
        p.afk = (p.afk || 0) + 1;
        if (p.afk >= 3) { forfeit(room, uid, 'inactividad'); return; }
      }
    }
    resolveFirst(room);
  }

  function choose(user, zone) {
    const room = rooms.get(userRoom.get(user.id));
    if (!room || room.status !== 'playing' || !room.cur) throw new game.GameError('No hay ninguna jugada en curso');
    const c = room.cur;
    if (c.phase !== 'choose' || c.paused) throw new game.GameError('Ahora no puedes elegir');
    if (!Number.isInteger(zone) || zone < 0 || zone > 5) throw new game.GameError('Zona no válida');
    const shooterId = room.order[c.side];
    const key = user.id === shooterId ? 'shot' : 'dive';
    if (c[key] != null) throw new game.GameError('Ya has confirmado tu elección');
    c[key] = zone;
    room.players[user.id].afk = 0;
    if (c.shot != null && c.dive != null) { clearTimer(room); resolveFirst(room); } else broadcast(room);
  }

  // Zona marcada sin confirmar: se guarda para usarla si se acaba el tiempo.
  function mark(user, zone) {
    const room = rooms.get(userRoom.get(user.id));
    const c = room?.cur;
    if (!room || room.status !== 'playing' || !c || c.phase !== 'choose' || c.paused) return;
    if (!Number.isInteger(zone) || zone < 0 || zone > 5) return;
    const key = user.id === room.order[c.side] ? 'shot' : 'dive';
    if (c[key] != null) return;
    c.marked[key] = zone;
    room.players[user.id].afk = 0;
  }

  function resolveFirst(room) {
    const c = room.cur;
    const shooter = room.players[room.order[c.side]].shooter;
    const keeper = room.players[room.order[1 - c.side]].keeper;
    c.power = shotPower(shooter, random());
    if (random() < missChance(shooter, c.shot)) return finishKick(room, 'fuera');
    if (c.dive === c.shot) {
      c.saveP = saveChance(shooter, keeper, c.shot, c.power);
      return finishKick(room, random() < c.saveP ? 'parada' : 'gol');
    }
    if (!canDoubleSave(keeper) || random() >= SHOT.second.chance) return finishKick(room, 'gol');
    // Doble parada: el portero hace el minijuego y, si lo completa, tiene 1 s para volver a tirarse.
    // Solo el portero puede actuar; la zona del disparo sigue oculta.
    const windowMs = (T.minigameMs ?? SHOT.second.minigameMs) + (T.diveMs ?? SHOT.second.diveMs);
    c.phase = 'second';
    c.windowMs = windowMs;
    c.deadline = now() + T.secondPhaseIntroMs + windowMs + T.networkGraceMs;
    setTimer(room, T.secondPhaseIntroMs + windowMs + T.networkGraceMs, () => resolveSecond(room));
    broadcast(room);
  }

  function secondDive(user, zone) {
    const room = rooms.get(userRoom.get(user.id));
    const c = room?.cur;
    if (!room || room.status !== 'playing' || !c || c.phase !== 'second') throw new game.GameError('No hay segunda estirada disponible');
    if (room.order[1 - c.side] !== user.id) throw new game.GameError('Solo el portero puede reincorporarse');
    if (!Number.isInteger(zone) || zone < 0 || zone > 5 || zone === c.dive) throw new game.GameError('Elige otra dirección');
    if (now() > c.deadline) throw new game.GameError('Se acabó el tiempo');
    if (c.dive2 != null) throw new game.GameError('Ya te has reincorporado');
    c.dive2 = zone;
    clearTimer(room);
    resolveSecond(room);
  }

  function resolveSecond(room) {
    const c = room.cur;
    if (!c || c.phase !== 'second') return;
    const shooter = room.players[room.order[c.side]].shooter;
    const keeper = room.players[room.order[1 - c.side]].keeper;
    if (c.dive2 === c.shot) {
      c.saveP = saveChance(shooter, keeper, c.shot, c.power) * SHOT.second.saveFactor;
      return finishKick(room, random() < c.saveP ? 'parada' : 'gol', true);
    }
    finishKick(room, 'gol', c.dive2 != null);
  }

  function finishKick(room, outcome, second = false) {
    const c = room.cur;
    const kick = {
      side: c.side, shooterId: room.order[c.side], zone: c.shot, dive: c.dive, dive2: c.dive2,
      power: c.power, outcome, second, secondWindowMs: c.windowMs || null,
    };
    room.kicks.push(kick);
    room.cur = { ...c, phase: 'result' };
    const sc = score(room);
    for (const id of room.order) {
      emitTo(id, 'kick:result', { kick: { side: kick.side, zone: kick.zone, dive: kick.dive, dive2: kick.dive2, outcome, second, power: kick.power }, score: sc, index: room.kicks.length - 1 });
    }
    const w = shootoutWinner(room.kicks, T.kicksPerTeam);
    if (w != null) return endMatch(room, w, 'tanda completada');
    broadcast(room);
    setTimer(room, T.afterKickMs, () => startKick(room));
  }

  async function endMatch(room, winnerSide, reason, abandonerId = null) {
    if (room.status === 'finished' || room.status === 'closed') return;
    clearTimer(room);
    for (const p of Object.values(room.players)) { clearTimeout(p.discTimer); p.discDeadline = null; }
    room.status = 'finished';
    const winnerId = room.order[winnerSide];
    const loserId = room.order[1 - winnerSide];
    const sc = score(room);
    room.result = { winnerId, winnerSide, reason, score: sc };
    let rewards = null;
    try {
      rewards = await game.finishMatch(db, {
        matchId: room.id, winnerId, loserId, reason, homeGoals: sc[0], awayGoals: sc[1],
        kicks: room.kicks, abandonerId,
      });
    } catch (e) { console.error('Error guardando resultado', e); }
    room.result.rewards = rewards || {};
    for (const id of room.order) if (userRoom.get(id) === room.code) userRoom.delete(id);
    broadcast(room);
    for (const id of room.order) emitTo(id, 'match:end', { code: room.code, ...view(room, id).result });
    // La sala terminada se conserva un rato para poder consultar el resultado.
    setTimeout(() => { if (rooms.get(room.code) === room) rooms.delete(room.code); }, 120_000);
  }

  function forfeit(room, userId, reason) {
    if (!['starting', 'playing'].includes(room.status)) return;
    const side = room.order.indexOf(userId);
    if (side < 0) return;
    return endMatch(room, 1 - side, reason, userId);
  }

  function leave(user) {
    const code = userRoom.get(user.id);
    const room = code && rooms.get(code);
    if (!room) { userRoom.delete(user.id); return; }
    if (room.status === 'waiting') return closeRoom(room, 'El anfitrión ha cerrado la sala');
    return forfeit(room, user.id, 'abandono');
  }

  // ---------------- Conexión y desconexión ----------------
  function markDisconnected(room, userId) {
    const p = room.players[userId];
    if (!p || p.discTimer) return;
    p.discDeadline = now() + T.disconnectGraceMs;
    p.discTimer = setTimeout(() => {
      p.discTimer = null;
      if (isOnline(userId)) return;
      if (room.status === 'waiting') closeRoom(room, 'El anfitrión se ha desconectado');
      else forfeit(room, userId, 'desconexión');
    }, T.disconnectGraceMs);
    const c = room.cur;
    if (room.status === 'playing' && c && c.phase === 'choose' && !c.paused) {
      clearTimer(room);
      c.paused = true;
      c.pausedRemaining = Math.max(0, c.deadline - now());
    }
  }

  function onConnect(user) {
    online.set(user.id, (online.get(user.id) || 0) + 1);
    const room = rooms.get(userRoom.get(user.id));
    if (!room) return;
    const p = room.players[user.id];
    if (p?.discTimer) { clearTimeout(p.discTimer); p.discTimer = null; p.discDeadline = null; }
    const c = room.cur;
    if (room.status === 'playing' && c && c.paused && !anyDisconnected(room)) {
      c.paused = false;
      const ms = Math.max(c.pausedRemaining, 8000);
      c.deadline = now() + ms;
      setTimer(room, ms, () => onChooseTimeout(room));
    }
    broadcast(room);
  }

  function onDisconnect(user) {
    const n = (online.get(user.id) || 1) - 1;
    if (n > 0) { online.set(user.id, n); return; }
    online.delete(user.id);
    const room = rooms.get(userRoom.get(user.id));
    if (!room) return;
    markDisconnected(room, user.id);
    broadcast(room);
  }

  // Al banear o borrar una cuenta: si estaba jugando, pierde por abandono.
  function kickUser(userId, reason) {
    const room = rooms.get(userRoom.get(userId));
    if (!room) return;
    if (room.status === 'waiting') return closeRoom(room, reason);
    return forfeit(room, userId, reason);
  }

  function stateFor(userId) {
    const room = rooms.get(userRoom.get(userId));
    return room ? view(room, userId) : null;
  }

  return {
    createRoom, joinRoom, choose, mark, secondDive, leave, onConnect, onDisconnect, kickUser, stateFor,
    isOnline, onlineIds: () => [...online.keys()],
    setRandom(fn) { random = fn; },
    _rooms: rooms,
  };
}
