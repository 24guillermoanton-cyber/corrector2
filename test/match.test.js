// Pruebas de partidos online: tanda completa, final anticipado, muerte súbita,
// segunda estirada, decisiones ocultas, desconexiones y recompensas únicas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, newUser, giveLineup, startRoom, playKick, waitFor, call } from './helpers.js';
import { shootoutWinner } from '../server/match.js';
import { finishMatch } from '../server/game.js';
import { ECONOMY } from '../server/config.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.stop(); });

const SAVE = [0.5, 0.99, 0.0]; // potencia media, no va fuera, el portero la para
const KANE = 'j-harry-kane';
const MOLINA = 'j-jorge-molina';      // poca potencia
const COURTOIS = 'p-thibaut-courtois';
const COSTA = 'p-diogo-costa';        // reincorporación altísima

async function pair(shA = KANE, kA = COURTOIS, shB = KANE, kB = COURTOIS) {
  const a = await newUser(srv, 'a');
  const b = await newUser(srv, 'b');
  await giveLineup(srv, a, shA, kA);
  await giveLineup(srv, b, shB, kB);
  const sa = await a.connect();
  const sb = await b.connect();
  return { a, b, sa, sb };
}

test('reglas: final anticipado y muerte súbita (función pura)', () => {
  const k = (side, outcome) => ({ side, outcome });
  // 3-0 tras 3 lanzamientos cada uno: el B ya no puede alcanzar
  assert.equal(shootoutWinner([k(0, 'gol'), k(1, 'parada'), k(0, 'gol'), k(1, 'fuera'), k(0, 'gol'), k(1, 'parada')]), 0);
  // 2-0 tras 2 cada uno: aún puede alcanzar
  assert.equal(shootoutWinner([k(0, 'gol'), k(1, 'parada'), k(0, 'gol'), k(1, 'fuera')]), null);
  // 5-5: sigue
  const tie = []; for (let i = 0; i < 10; i++) tie.push(k(i % 2, 'gol'));
  assert.equal(shootoutWinner(tie), null);
  // muerte súbita: A marca, todavía no se decide hasta que tire B
  assert.equal(shootoutWinner([...tie, k(0, 'gol')]), null);
  assert.equal(shootoutWinner([...tie, k(0, 'gol'), k(1, 'parada')]), 0);
  assert.equal(shootoutWinner([...tie, k(0, 'fuera'), k(1, 'gol')]), 1);
});

test('tanda completa de 5 lanzamientos por equipo entre dos usuarios (5-4)', async () => {
  const { a, b, sa, sb } = await pair();
  const coinsA = (await a.get('/api/me')).data.user.coins;
  const coinsB = (await b.get('/api/me')).data.user.coins;
  await startRoom(a, sa, sb);
  for (let i = 0; i < 10; i++) {
    if (i === 9) await playKick(sa, sb, i, { zone: 4, dive: 4, rolls: SAVE, srv });
    else await playKick(sa, sb, i, { zone: i % 6, dive: (i + 1) % 6, srv });
  }
  await waitFor(() => sa.last.status === 'finished' && sb.last.status === 'finished', { msg: 'fin' });
  assert.deepEqual(sa.last.score, [5, 4]);
  assert.equal(sa.last.kicks.length, 10);
  assert.equal(sa.last.kicks[9].outcome, 'parada');
  assert.equal(sa.last.result.winnerId, a.user.id);
  assert.equal(sa.last.result.rewards.coins, ECONOMY.winReward);
  assert.equal(sb.last.result.rewards.coins, ECONOMY.lossReward);
  // Las 10 animaciones de resultado llegaron a ambos clientes
  assert.equal(sa.results.length, 10);
  assert.equal(sb.results.length, 10);

  const meA = (await a.get('/api/me')).data.user;
  const meB = (await b.get('/api/me')).data.user;
  assert.equal(meA.wins, 1); assert.equal(meA.losses, 0); assert.equal(meA.streak, 1);
  assert.equal(meB.wins, 0); assert.equal(meB.losses, 1);
  assert.equal(meA.coins, coinsA + ECONOMY.winReward);
  assert.equal(meB.coins, coinsB + ECONOMY.lossReward);

  // Recompensas una sola vez: volver a registrar el mismo partido no da nada
  const [m] = await srv.db.query('SELECT * FROM matches WHERE home_id=$1', [a.user.id]);
  assert.equal(m.status, 'finished');
  assert.equal(m.home_goals, 5); assert.equal(m.away_goals, 4);
  const again = await finishMatch(srv.db, { matchId: m.id, winnerId: a.user.id, loserId: b.user.id, reason: 'x', homeGoals: 5, awayGoals: 4, kicks: [] });
  assert.equal(again, null);
  assert.equal((await a.get('/api/me')).data.user.coins, coinsA + ECONOMY.winReward);
  a.closeAll(); b.closeAll();
});

test('termina antes si un equipo ya no puede alcanzar al otro (3-0)', async () => {
  const { a, b, sa, sb } = await pair();
  await startRoom(a, sa, sb);
  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) await playKick(sa, sb, i, { zone: 1, dive: 0, srv });
    else await playKick(sa, sb, i, { zone: 5, dive: 5, rolls: SAVE, srv });
  }
  await waitFor(() => sa.last.status === 'finished', { msg: 'fin anticipado' });
  assert.deepEqual(sa.last.score, [3, 0]);
  assert.equal(sa.last.kicks.length, 6);
  a.closeAll(); b.closeAll();
});

test('empate 5-5 y muerte súbita', async () => {
  const { a, b, sa, sb } = await pair();
  await startRoom(a, sa, sb);
  for (let i = 0; i < 10; i++) await playKick(sa, sb, i, { zone: 0, dive: 1, srv });
  await waitFor(() => sa.last.kicks.length === 10 && sa.last.cur?.phase === 'choose', { msg: 'muerte súbita' });
  assert.equal(sa.last.status, 'playing');
  assert.deepEqual(sa.last.score, [5, 5]);
  assert.equal(sa.last.suddenDeath, true);
  assert.equal(sa.last.round, 6);
  await playKick(sa, sb, 10, { zone: 2, dive: 3, srv });                 // A marca
  await waitFor(() => sa.last.kicks.length === 11, { msg: 'kick 11' });
  assert.equal(sa.last.status, 'playing', 'no se decide hasta que tira B');
  await playKick(sa, sb, 11, { zone: 3, dive: 3, rolls: SAVE, srv });  // B falla
  await waitFor(() => sa.last.status === 'finished', { msg: 'fin muerte súbita' });
  assert.deepEqual(sa.last.score, [6, 5]);
  assert.equal(sa.last.result.winnerId, a.user.id);
  a.closeAll(); b.closeAll();
});

test('las decisiones del rival permanecen ocultas', async () => {
  const { a, b, sa, sb } = await pair();
  await startRoom(a, sa, sb);
  await waitFor(() => sb.last.cur?.phase === 'choose');
  const r = await call(sa, 'match:choose', { zone: 4 });
  assert.ok(r.ok);
  await waitFor(() => sb.last.cur.opponentChose === true, { msg: 'aviso de elección' });
  const keeperView = sb.last;
  assert.equal(keeperView.cur.yourChoice, null);
  assert.equal(JSON.stringify(keeperView).includes('"shot"'), false);
  // El lanzador no puede cambiar ni confirmar dos veces
  assert.equal((await call(sa, 'match:choose', { zone: 1 })).ok, false);
  // Datos inválidos rechazados
  assert.equal((await call(sb, 'match:choose', { zone: 9 })).ok, false);
  await call(sa, 'room:leave');
  await waitFor(() => sb.last.status === 'finished');
  assert.equal(sb.last.result.reason, 'abandono');
  assert.equal(sa.last.result.rewards.coins, ECONOMY.abandonReward);
  a.closeAll(); b.closeAll();
});

test('segunda estirada del portero (reincorporación alta + disparo flojo)', async () => {
  // A: portero Diogo Costa (reincorporación muy alta). B: lanzador Jorge Molina (poca potencia).
  const { a, b, sa, sb } = await pair(KANE, COSTA, MOLINA, COURTOIS);
  await startRoom(a, sa, sb);
  // Kick 0: Kane (mucha potencia) contra Courtois que falla el lado -> sin segunda estirada
  await playKick(sa, sb, 0, { zone: 0, dive: 5, srv });
  await waitFor(() => sa.results.length === 1);
  assert.equal(sa.results[0].kick.outcome, 'gol');
  assert.equal(sa.results[0].kick.second, false);

  // Kick 1: Molina tira a la media izquierda (2); Costa se tira a la derecha (3)
  await playKick(sa, sb, 1, { zone: 2, dive: 3, rolls: [0.5, 0.99], srv });
  await waitFor(() => sa.last.cur?.phase === 'second', { msg: 'ventana de segunda estirada' });
  const kv = sa.last.cur;
  assert.equal(kv.role, 'save');
  assert.ok(kv.windowMs >= 700, 'ventana mínima');
  assert.equal(kv.firstDive, 3);
  assert.equal(kv.yourChoice, 3);
  assert.equal(JSON.stringify(sa.last).includes('"shot"'), false, 'la zona del disparo sigue oculta');
  assert.equal(sa.last.kicks.length, 1);
  // Solo el portero puede actuar y debe elegir otra dirección
  assert.equal((await call(sb, 'match:second', { zone: 2 })).ok, false);
  assert.equal((await call(sa, 'match:second', { zone: 3 })).ok, false);
  srv.rolls.push(0.0);
  const r = await call(sa, 'match:second', { zone: 2 });
  assert.ok(r.ok, r.error);
  await waitFor(() => sa.results.length === 2);
  const k = sa.results[1].kick;
  assert.equal(k.outcome, 'parada');
  assert.equal(k.second, true);
  assert.equal(k.dive2, 2);
  assert.equal(k.zone, 2);

  // Kick 2 normal, kick 3: segunda estirada que expira sin respuesta -> gol
  await playKick(sa, sb, 2, { zone: 1, dive: 0, srv });
  await playKick(sa, sb, 3, { zone: 4, dive: 1, rolls: [0.5, 0.99], srv });
  await waitFor(() => sa.last.cur?.phase === 'second');
  const t0 = Date.now();
  await waitFor(() => sa.results.length === 4, { msg: 'expira la ventana' });
  assert.ok(Date.now() - t0 >= 500, 'el servidor espera a que se cierre la ventana');
  assert.equal(sa.results[3].kick.outcome, 'gol');
  assert.equal(sa.results[3].kick.dive2, null);
  await call(sb, 'room:leave');
  a.closeAll(); b.closeAll();
});

test('la potencia reduce la ventana de la segunda estirada', async () => {
  const { secondDiveWindow } = await import('../server/match.js');
  const keeper = { tier: 'oro', stats: { reincorporacion: 90 } };
  const slow = secondDiveWindow(keeper, 50);
  const medium = secondDiveWindow(keeper, 70);
  const strong = secondDiveWindow(keeper, 85);
  assert.ok(slow > medium, 'disparo flojo = más tiempo');
  assert.equal(strong, 0, 'disparo potente = sin segunda estirada');
  assert.equal(secondDiveWindow({ tier: 'oro', stats: { reincorporacion: 60 } }, 50), 0, 'reincorporación baja = sin segunda estirada');
  assert.equal(secondDiveWindow({ tier: 'plata', stats: { reincorporacion: 99 } }, 50), 0, 'portero de plata = sin segunda estirada');
  assert.equal(secondDiveWindow({ tier: 'bronce', stats: { reincorporacion: 99 } }, 50), 0, 'portero de bronce = sin segunda estirada');
});

test('desconexión: pausa, reconexión y derrota si no vuelve', async () => {
  const { a, b, sa, sb } = await pair();
  await startRoom(a, sa, sb);
  // B se desconecta y vuelve a tiempo: la jugada se reanuda
  sb.close();
  await waitFor(() => sa.last.players[1].connected === false && sa.last.cur.paused === true, { msg: 'pausa' });
  const sb2 = await b.connect();
  await waitFor(() => sa.last.players[1].connected === true && sa.last.cur.paused === false, { msg: 'reanuda' });
  await waitFor(() => sb2.last?.status === 'playing', { msg: 'estado tras reconectar' });
  // B se desconecta y no vuelve: A gana por desconexión
  sb2.close();
  await waitFor(() => sa.last.status === 'finished', { msg: 'derrota por desconexión', timeout: 4000 });
  assert.equal(sa.last.result.reason, 'desconexión');
  assert.equal(sa.last.result.winnerId, a.user.id);
  const meB = (await b.get('/api/me')).data.user;
  assert.equal(meB.losses, 1);
  a.closeAll(); b.closeAll();
});

test('salas: código inválido, sala llena y sin alineación', async () => {
  const { a, b, sa, sb } = await pair();
  const c = await newUser(srv, 'c');
  await giveLineup(srv, c, KANE, COURTOIS);
  const sc = await c.connect();
  assert.equal((await call(sb, 'room:join', { code: 'ZZZZZZ' })).ok, false);
  const code = await startRoom(a, sa, sb);
  const full = await call(sc, 'room:join', { code });
  assert.equal(full.ok, false);
  const d = await newUser(srv, 'd');
  const sd = await d.connect();
  const nolineup = await call(sd, 'room:create');
  assert.equal(nolineup.ok, false);
  assert.match(nolineup.error, /alineación/);
  await call(sa, 'room:leave');
  a.closeAll(); b.closeAll(); c.closeAll(); d.closeAll();
});

test('si se acaba el tiempo, el balón va a la zona marcada (aunque no se confirme)', async () => {
  const { a, b, sa, sb } = await pair();
  await startRoom(a, sa, sb);
  await waitFor(() => sa.last?.cur?.phase === 'choose' && !sa.last.cur.paused && sb.last?.cur?.phase === 'choose', { msg: 'primer lanzamiento' });
  srv.rolls.push(0.5, 0.99);
  await call(sa, 'match:mark', { zone: 3 }); // el lanzador marca "Media derecha" y no confirma
  await call(sb, 'match:choose', { zone: 0 });
  await waitFor(() => sa.results.length === 1, { msg: 'resultado por tiempo', timeout: 8000 });
  assert.equal(sa.results[0].kick.zone, 3);
  await call(sa, 'room:leave');
  a.closeAll(); b.closeAll();
});
