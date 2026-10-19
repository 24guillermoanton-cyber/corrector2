// Lógica de juego persistente: sobres, colección, alineación, recompensas y player picks.
// Todo se decide en el servidor dentro de transacciones.
import crypto from 'node:crypto';
import { CARD_BY_ID, cardsOf } from './cards.js';
import { ECONOMY, PACKS, PICK } from './config.js';

export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const secureRandom = () => crypto.randomInt(0, 1_000_000) / 1_000_000;

export function rollTier(odds, rand = secureRandom) {
  const total = Object.values(odds).reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (const [tier, p] of Object.entries(odds)) {
    if (p <= 0) continue;
    if (x < p) return tier;
    x -= p;
  }
  return Object.entries(odds).filter(([, p]) => p > 0).at(-1)[0];
}

function drawCard(type, odds, exclude = new Set()) {
  for (let i = 0; i < 20; i++) {
    const pool = cardsOf(type, rollTier(odds)).filter((c) => !exclude.has(c.id));
    if (pool.length) return pool[crypto.randomInt(0, pool.length)];
  }
  throw new Error('No se pudo sortear carta');
}

export function publicUser(u) {
  return {
    id: u.id, username: u.username, crest: u.crest, role: u.role, coins: u.coins,
    wins: u.wins, losses: u.losses, streak: u.streak, bestStreak: u.best_streak,
    shooterCard: u.shooter_card, keeperCard: u.keeper_card, tutorialSeen: u.tutorial_seen,
    createdAt: u.created_at,
  };
}

export async function getCollection(db, userId) {
  const rows = await db.query(
    `SELECT card_id, count(*)::int AS n, min(created_at) AS first FROM user_cards
     WHERE user_id = $1 GROUP BY card_id`, [userId]);
  return rows.filter((r) => CARD_BY_ID.has(r.card_id)).map((r) => ({ cardId: r.card_id, count: r.n, first: r.first }));
}

async function ensureLineup(q, userId) {
  // Si al usuario le falta lanzador o portero titular, se asigna el mejor que tenga.
  const [u] = await q('SELECT shooter_card, keeper_card FROM users WHERE id=$1', [userId]);
  if (u.shooter_card && u.keeper_card) return;
  const owned = (await q('SELECT DISTINCT card_id FROM user_cards WHERE user_id=$1', [userId]))
    .map((r) => CARD_BY_ID.get(r.card_id)).filter(Boolean).sort((a, b) => b.rating - a.rating);
  const shooter = u.shooter_card || owned.find((c) => c.type === 'jugador')?.id || null;
  const keeper = u.keeper_card || owned.find((c) => c.type === 'portero')?.id || null;
  await q('UPDATE users SET shooter_card=$2, keeper_card=$3 WHERE id=$1', [userId, shooter, keeper]);
}

export async function openPack(db, userId, packId) {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) throw new GameError('Ese sobre no existe');
  return db.tx(async ({ query: q }) => {
    // Descuento atómico: solo si hay saldo suficiente (impide gastar dos veces el mismo dinero).
    const paid = await q('UPDATE users SET coins = coins - $2 WHERE id=$1 AND coins >= $2 RETURNING coins',
      [userId, pack.price]);
    if (!paid.length) throw new GameError('No tienes monedas suficientes', 402);
    const player = drawCard('jugador', pack.odds);
    const keeper = drawCard('portero', pack.odds);
    const owned = new Set((await q('SELECT DISTINCT card_id FROM user_cards WHERE user_id=$1', [userId])).map((r) => r.card_id));
    for (const c of [player, keeper]) {
      await q('INSERT INTO user_cards (user_id, card_id, source) VALUES ($1,$2,$3)', [userId, c.id, `sobre:${pack.id}`]);
    }
    await q('INSERT INTO pack_openings (user_id, pack_id, price, cards) VALUES ($1,$2,$3,$4)',
      [userId, pack.id, pack.price, JSON.stringify([player.id, keeper.id])]);
    await ensureLineup(q, userId);
    return {
      coins: paid[0].coins,
      cards: [player, keeper].map((c) => ({ ...c, isNew: !owned.has(c.id) })),
    };
  });
}

export async function setLineup(db, userId, { shooterCard, keeperCard }) {
  const s = CARD_BY_ID.get(shooterCard);
  const k = CARD_BY_ID.get(keeperCard);
  if (!s || s.type !== 'jugador') throw new GameError('Lanzador no válido');
  if (!k || k.type !== 'portero') throw new GameError('Portero no válido');
  const owned = await db.query('SELECT DISTINCT card_id FROM user_cards WHERE user_id=$1 AND card_id = ANY($2)',
    [userId, [s.id, k.id]]);
  if (owned.length !== 2) throw new GameError('Solo puedes alinear cartas de tu colección');
  await db.query('UPDATE users SET shooter_card=$2, keeper_card=$3 WHERE id=$1', [userId, s.id, k.id]);
}

export async function getLineup(db, userId) {
  const [u] = await db.query('SELECT shooter_card, keeper_card FROM users WHERE id=$1', [userId]);
  if (!u || !u.shooter_card || !u.keeper_card) return null;
  const owned = await db.query('SELECT DISTINCT card_id FROM user_cards WHERE user_id=$1 AND card_id = ANY($2)',
    [userId, [u.shooter_card, u.keeper_card]]);
  if (owned.length !== 2) return null;
  return { shooter: CARD_BY_ID.get(u.shooter_card), keeper: CARD_BY_ID.get(u.keeper_card) };
}

// Utilidad de repetidas: venta rápida de una copia sobrante.
export async function quickSell(db, userId, cardId) {
  const card = CARD_BY_ID.get(cardId);
  if (!card) throw new GameError('Carta no válida');
  const value = ECONOMY.quickSell[card.tier];
  return db.tx(async ({ query: q }) => {
    const copies = await q('SELECT id FROM user_cards WHERE user_id=$1 AND card_id=$2 ORDER BY id DESC FOR UPDATE',
      [userId, cardId]);
    if (copies.length < 2) throw new GameError('Solo puedes vender cartas repetidas (te quedas siempre con una copia)');
    await q('DELETE FROM user_cards WHERE id=$1', [copies[0].id]);
    const [u] = await q('UPDATE users SET coins = coins + $2 WHERE id=$1 RETURNING coins', [userId, value]);
    return { coins: u.coins, sold: value, remaining: copies.length - 1 };
  });
}

export async function sellAllDuplicates(db, userId) {
  return db.tx(async ({ query: q }) => {
    const rows = await q('SELECT id, card_id FROM user_cards WHERE user_id=$1 ORDER BY id FOR UPDATE', [userId]);
    const seen = new Set();
    let total = 0, count = 0;
    for (const r of rows) {
      if (!seen.has(r.card_id)) { seen.add(r.card_id); continue; }
      const card = CARD_BY_ID.get(r.card_id);
      if (!card) continue;
      await q('DELETE FROM user_cards WHERE id=$1', [r.id]);
      total += ECONOMY.quickSell[card.tier]; count++;
    }
    const [u] = await q('UPDATE users SET coins = coins + $2 WHERE id=$1 RETURNING coins', [userId, total]);
    return { coins: u.coins, sold: total, count };
  });
}

// ---- Partidas ----
export async function startMatchRecord(db, { id, code, home, away }) {
  await db.query(`INSERT INTO matches (id, room_code, home_id, away_id, home_name, away_name, status)
                  VALUES ($1,$2,$3,$4,$5,$6,'playing')`, [id, code, home.id, away.id, home.name, away.name]);
}

function generatePickOptions() {
  const chosen = new Set();
  const out = [];
  for (let i = 0; i < PICK.options; i++) {
    const type = crypto.randomInt(0, 2) === 0 ? 'jugador' : 'portero';
    const c = drawCard(type, PICK.odds, chosen);
    chosen.add(c.id); out.push(c.id);
  }
  return out;
}

// Registra el resultado y reparte recompensas UNA sola vez (la fila solo pasa de 'playing' a 'finished' una vez).
export async function finishMatch(db, { matchId, winnerId, loserId, reason, homeGoals, awayGoals, kicks, abandonerId }) {
  return db.tx(async ({ query: q }) => {
    const upd = await q(`UPDATE matches SET status='finished', winner_id=$2, end_reason=$3, home_goals=$4, away_goals=$5,
                           kicks=$6, finished_at=now() WHERE id=$1 AND status='playing' RETURNING id`,
      [matchId, winnerId, reason, homeGoals, awayGoals, JSON.stringify(kicks)]);
    if (!upd.length) return null; // ya registrado: no se vuelve a premiar
    const rewards = {};
    const w = await q(`UPDATE users SET wins = wins + 1, streak = streak + 1, best_streak = GREATEST(best_streak, streak + 1),
                         coins = coins + $2 WHERE id=$1 RETURNING streak`, [winnerId, ECONOMY.winReward]);
    if (w.length) {
      rewards[winnerId] = { coins: ECONOMY.winReward, result: 'victoria', streak: w[0].streak, newPick: null };
      if (w[0].streak > 0 && w[0].streak % PICK.winsNeeded === 0) {
        const options = generatePickOptions();
        const [pk] = await q('INSERT INTO player_picks (user_id, options, streak_at) VALUES ($1,$2,$3) RETURNING id',
          [winnerId, JSON.stringify(options), w[0].streak]);
        rewards[winnerId].newPick = pk.id;
      }
    }
    const lossCoins = abandonerId === loserId ? ECONOMY.abandonReward : ECONOMY.lossReward;
    const l = await q('UPDATE users SET losses = losses + 1, streak = 0, coins = coins + $2 WHERE id=$1 RETURNING streak',
      [loserId, lossCoins]);
    if (l.length) rewards[loserId] = { coins: lossCoins, result: 'derrota', streak: 0, newPick: null };
    return rewards;
  });
}

export async function cancelMatchRecord(db, matchId, reason) {
  await db.query(`UPDATE matches SET status='cancelled', end_reason=$2, finished_at=now() WHERE id=$1 AND status='playing'`,
    [matchId, reason]);
}

// ---- Player picks ----
// Pick extra (lo crea un administrador para sí mismo o como regalo). streak_at = 0.
export async function createPick(db, userId) {
  const [pk] = await db.query('INSERT INTO player_picks (user_id, options, streak_at) VALUES ($1,$2,0) RETURNING id',
    [userId, JSON.stringify(generatePickOptions())]);
  return pk.id;
}

export async function listPicks(db, userId) {
  const rows = await db.query(`SELECT * FROM player_picks WHERE user_id=$1 ORDER BY id DESC LIMIT 30`, [userId]);
  return rows.map((r) => ({
    id: r.id, streakAt: r.streak_at, options: JSON.parse(r.options),
    claimedCard: r.claimed_card, createdAt: r.created_at, claimedAt: r.claimed_at,
  }));
}

export async function claimPick(db, userId, pickId, cardId) {
  return db.tx(async ({ query: q }) => {
    const [p] = await q('SELECT * FROM player_picks WHERE id=$1 AND user_id=$2 FOR UPDATE', [pickId, userId]);
    if (!p) throw new GameError('Player pick no encontrado', 404);
    if (p.claimed_card) throw new GameError('Este player pick ya se reclamó', 409);
    if (!JSON.parse(p.options).includes(cardId)) throw new GameError('Esa carta no está entre las opciones');
    const upd = await q(`UPDATE player_picks SET claimed_card=$2, claimed_at=now() WHERE id=$1 AND claimed_card IS NULL RETURNING id`,
      [pickId, cardId]);
    if (!upd.length) throw new GameError('Este player pick ya se reclamó', 409);
    await q('INSERT INTO user_cards (user_id, card_id, source) VALUES ($1,$2,$3)', [userId, cardId, `pick:${pickId}`]);
    await ensureLineup(q, userId);
    return CARD_BY_ID.get(cardId);
  });
}

// ---- Clasificaciones (desempate estable: menos derrotas/victorias, antigüedad y id) ----
export async function leaderboard(db, kind, limit = 50) {
  const order = kind === 'derrotas'
    ? 'losses DESC, wins ASC, created_at ASC, id ASC'
    : 'wins DESC, losses ASC, created_at ASC, id ASC';
  const rows = await db.query(`SELECT id, username, crest, wins, losses FROM users WHERE NOT banned
                               ORDER BY ${order} LIMIT $1`, [limit]);
  return rows.map((r, i) => ({ pos: i + 1, id: r.id, username: r.username, crest: r.crest, wins: r.wins, losses: r.losses }));
}
