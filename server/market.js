// =====================================================================
//  Mercado de transferibles (estilo FIFA): poner a la venta cartas transferibles
//  con precio de salida y "comprar ya", pujar, comprar al momento o retirar.
//  Las monedas de las pujas se retienen al pujar y se devuelven si alguien supera
//  la puja. Al vender, el vendedor cobra el precio menos un impuesto.
// =====================================================================
import { CARD_BY_ID } from './cards.js';
import { MARKET } from './config.js';
import { GameError } from './game.js';

export function minNextBid(l) {
  if (l.bid == null) return l.start_price;
  return l.bid + Math.max(MARKET.minIncrement, Math.ceil(l.bid * MARKET.incrementPct));
}
const payout = (price) => Math.floor(price * (1 - MARKET.taxPct));

function view(l, viewerId) {
  return {
    id: l.id, cardId: l.card_id, sellerId: l.seller_id, sellerName: l.seller_name,
    startPrice: l.start_price, buyNow: l.buy_now, bid: l.bid, bids: l.bids,
    youAreBidder: l.bidder_id === viewerId, mine: l.seller_id === viewerId,
    minBid: minNextBid(l), expiresAt: l.expires_at, status: l.status,
    leftMs: Math.max(0, new Date(l.expires_at).getTime() - Date.now()),
  };
}

const SELECT = `SELECT l.*, u.username AS seller_name FROM market_listings l LEFT JOIN users u ON u.id = l.seller_id`;

export function createMarket({ db, notify = () => {} }) {
  // Cierra las subastas vencidas: con puja, la carta pasa al pujador; sin puja, vuelve al vendedor.
  async function settleExpired() {
    const events = [];
    await db.tx(async ({ query: q }) => {
      const due = await q(`SELECT * FROM market_listings WHERE status='active' AND expires_at <= now() ORDER BY id FOR UPDATE`);
      for (const l of due) {
        const name = CARD_BY_ID.get(l.card_id)?.name || l.card_id;
        if (l.bidder_id) {
          await q('INSERT INTO user_cards (user_id, card_id, source, tradable) VALUES ($1,$2,$3,TRUE)', [l.bidder_id, l.card_id, `mercado:${l.id}`]);
          await q('UPDATE users SET coins = coins + $2 WHERE id=$1', [l.seller_id, payout(l.bid)]);
          await q(`UPDATE market_listings SET status='sold', buyer_id=$2, final_price=$3, closed_at=now() WHERE id=$1`, [l.id, l.bidder_id, l.bid]);
          events.push([l.bidder_id, { type: 'won', card: name, amount: l.bid }]);
          events.push([l.seller_id, { type: 'sold', card: name, amount: payout(l.bid) }]);
        } else {
          await q('INSERT INTO user_cards (user_id, card_id, source, tradable) VALUES ($1,$2,$3,TRUE)', [l.seller_id, l.card_id, `mercado-vuelta:${l.id}`]);
          await q(`UPDATE market_listings SET status='expired', closed_at=now() WHERE id=$1`, [l.id]);
          events.push([l.seller_id, { type: 'expired', card: name }]);
        }
      }
    });
    for (const [uid, ev] of events) notify(uid, ev);
    return events.length;
  }

  async function list(userId, { cardId, startPrice, buyNow, minutes }) {
    const card = CARD_BY_ID.get(cardId);
    if (!card) throw new GameError('Carta no válida');
    const start = Number(startPrice), now = Number(buyNow), mins = Number(minutes);
    if (!Number.isInteger(start) || start < MARKET.minPrice || start > MARKET.maxPrice) throw new GameError(`El precio de salida debe estar entre ${MARKET.minPrice} y ${MARKET.maxPrice.toLocaleString('es-ES')}`);
    if (!Number.isInteger(now) || now <= start || now > MARKET.maxPrice) throw new GameError('El precio de "comprar ya" debe ser mayor que el de salida');
    if (!MARKET.durationsMin.includes(mins)) throw new GameError('Duración no válida');
    return db.tx(async ({ query: q }) => {
      const [{ n }] = await q(`SELECT count(*)::int AS n FROM market_listings WHERE seller_id=$1 AND status='active'`, [userId]);
      if (n >= MARKET.maxActivePerUser) throw new GameError(`Como mucho puedes tener ${MARKET.maxActivePerUser} cartas a la venta`);
      const copies = await q('SELECT id, tradable FROM user_cards WHERE user_id=$1 AND card_id=$2 ORDER BY id DESC FOR UPDATE', [userId, cardId]);
      const copy = copies.find((c) => c.tradable);
      if (!copy) throw new GameError('No tienes ninguna copia transferible de esta carta');
      const [u] = await q('SELECT shooter_card, keeper_card FROM users WHERE id=$1', [userId]);
      if (copies.length === 1 && (u.shooter_card === cardId || u.keeper_card === cardId)) {
        throw new GameError('Es tu titular y no tienes otra copia: pon otra carta de titular antes de venderla');
      }
      await q('DELETE FROM user_cards WHERE id=$1', [copy.id]);
      const [l] = await q(`INSERT INTO market_listings (seller_id, card_id, start_price, buy_now, expires_at)
                           VALUES ($1,$2,$3,$4, now() + ($5 || ' minutes')::interval) RETURNING id`, [userId, cardId, start, now, String(mins)]);
      return { id: l.id };
    });
  }

  async function bid(userId, listingId, amount) {
    const a = Number(amount);
    if (!Number.isInteger(a) || a <= 0) throw new GameError('Puja no válida');
    const events = [];
    const res = await db.tx(async ({ query: q }) => {
      const [l] = await q(`SELECT * FROM market_listings WHERE id=$1 FOR UPDATE`, [listingId]);
      if (!l || l.status !== 'active' || new Date(l.expires_at) <= new Date()) throw new GameError('Esta subasta ya ha terminado', 409);
      if (l.seller_id === userId) throw new GameError('No puedes pujar por tu propia carta');
      if (a >= l.buy_now) return { buyNow: true };
      if (a < minNextBid(l)) throw new GameError(`La puja mínima es ${minNextBid(l).toLocaleString('es-ES')} 🪙`);
      const paid = await q('UPDATE users SET coins = coins - $2 WHERE id=$1 AND coins >= $2 RETURNING coins', [userId, a]);
      if (!paid.length) throw new GameError('No tienes monedas suficientes', 402);
      if (l.bidder_id) {
        await q('UPDATE users SET coins = coins + $2 WHERE id=$1', [l.bidder_id, l.bid]);
        if (l.bidder_id !== userId) events.push([l.bidder_id, { type: 'outbid', card: CARD_BY_ID.get(l.card_id)?.name, amount: l.bid }]);
      }
      // Pujar en el último minuto alarga la subasta un poco (como en el FIFA)
      await q(`UPDATE market_listings SET bid=$2, bidder_id=$3, bids = bids + 1,
                 expires_at = GREATEST(expires_at, now() + interval '${MARKET.extendSeconds} seconds') WHERE id=$1`, [l.id, a, userId]);
      events.push([l.seller_id, { type: 'bid', card: CARD_BY_ID.get(l.card_id)?.name, amount: a }]);
      return { coins: paid[0].coins + (l.bidder_id === userId ? l.bid : 0) };
    });
    if (res.buyNow) return buyNow(userId, listingId);
    for (const [uid, ev] of events) notify(uid, ev);
    return res;
  }

  async function buyNow(userId, listingId) {
    const events = [];
    const res = await db.tx(async ({ query: q }) => {
      const [l] = await q(`SELECT * FROM market_listings WHERE id=$1 FOR UPDATE`, [listingId]);
      if (!l || l.status !== 'active' || new Date(l.expires_at) <= new Date()) throw new GameError('Esta subasta ya ha terminado', 409);
      if (l.seller_id === userId) throw new GameError('No puedes comprar tu propia carta');
      const paid = await q('UPDATE users SET coins = coins - $2 WHERE id=$1 AND coins >= $2 RETURNING coins', [userId, l.buy_now]);
      if (!paid.length) throw new GameError('No tienes monedas suficientes', 402);
      const name = CARD_BY_ID.get(l.card_id)?.name;
      let coins = paid[0].coins;
      if (l.bidder_id) {
        const [b] = await q('UPDATE users SET coins = coins + $2 WHERE id=$1 RETURNING coins', [l.bidder_id, l.bid]);
        if (l.bidder_id === userId) coins = b.coins;
        else events.push([l.bidder_id, { type: 'outbid', card: name, amount: l.bid }]);
      }
      await q('INSERT INTO user_cards (user_id, card_id, source, tradable) VALUES ($1,$2,$3,TRUE)', [userId, l.card_id, `mercado:${l.id}`]);
      await q('UPDATE users SET coins = coins + $2 WHERE id=$1', [l.seller_id, payout(l.buy_now)]);
      await q(`UPDATE market_listings SET status='sold', buyer_id=$2, final_price=$3, closed_at=now() WHERE id=$1`, [l.id, userId, l.buy_now]);
      events.push([l.seller_id, { type: 'sold', card: name, amount: payout(l.buy_now) }]);
      return { coins, card: CARD_BY_ID.get(l.card_id) };
    });
    for (const [uid, ev] of events) notify(uid, ev);
    return res;
  }

  async function cancel(userId, listingId) {
    return db.tx(async ({ query: q }) => {
      const [l] = await q(`SELECT * FROM market_listings WHERE id=$1 FOR UPDATE`, [listingId]);
      if (!l || l.seller_id !== userId) throw new GameError('Venta no encontrada', 404);
      if (l.status !== 'active') throw new GameError('Esta venta ya ha terminado', 409);
      if (l.bidder_id) throw new GameError('No puedes retirar una carta que ya tiene pujas');
      await q('INSERT INTO user_cards (user_id, card_id, source, tradable) VALUES ($1,$2,$3,TRUE)', [userId, l.card_id, `mercado-vuelta:${l.id}`]);
      await q(`UPDATE market_listings SET status='cancelled', closed_at=now() WHERE id=$1`, [l.id]);
      return { ok: true };
    });
  }

  async function search(userId, { q: text = '', tier = '', type = '' } = {}) {
    await settleExpired();
    const rows = await db.query(`${SELECT} WHERE l.status='active' AND l.seller_id <> $1 ORDER BY l.expires_at ASC LIMIT 300`, [userId]);
    const t = String(text).toLowerCase().trim();
    return rows.map((l) => view(l, userId)).filter((v) => {
      const c = CARD_BY_ID.get(v.cardId);
      if (!c) return false;
      if (t && !c.name.toLowerCase().includes(t)) return false;
      if (tier && c.tier !== tier) return false;
      if (type && c.type !== type) return false;
      return true;
    }).slice(0, 100);
  }

  async function mine(userId) {
    await settleExpired();
    const selling = await db.query(`${SELECT} WHERE l.seller_id=$1 AND (l.status='active' OR l.closed_at > now() - interval '3 days')
                                    ORDER BY (l.status='active') DESC, l.id DESC LIMIT 60`, [userId]);
    const bidding = await db.query(`${SELECT} WHERE l.status='active' AND l.bidder_id=$1 ORDER BY l.expires_at ASC`, [userId]);
    const won = await db.query(`${SELECT} WHERE l.buyer_id=$1 AND l.closed_at > now() - interval '3 days' ORDER BY l.closed_at DESC LIMIT 30`, [userId]);
    return { selling: selling.map((l) => view(l, userId)), bidding: bidding.map((l) => view(l, userId)), won: won.map((l) => view(l, userId)) };
  }

  return { settleExpired, list, bid, buyNow, cancel, search, mine };
}
