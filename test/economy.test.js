// Pruebas de cuentas, sobres, colección, player picks, clasificaciones, persistencia y administración.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Agent, startServer, newUser, giveLineup, waitFor, call } from './helpers.js';
import { ECONOMY, PACKS } from '../server/config.js';

const TEST_ADMIN_CODE = 'codigo-de-prueba-123';
process.env.ADMIN_INVITE_CODE = TEST_ADMIN_CODE;

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.stop(); });

test('registro: escudo obligatorio, validaciones y nombre único', async () => {
  const a = new Agent(srv.base);
  assert.equal((await a.post('/api/register', { username: 'sinescudo', password: 'secreta123' })).status, 400);
  assert.equal((await a.post('/api/register', { username: 'x', password: 'secreta123', crest: 'c01' })).status, 400);
  assert.equal((await a.post('/api/register', { username: 'cortita', password: '123', crest: 'c01' })).status, 400);
  const ok = await a.post('/api/register', { username: 'Unico_1', password: 'secreta123', crest: 'c05' });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.crest, 'c05');
  assert.equal(ok.data.user.coins, ECONOMY.startingCoins);
  assert.equal(ok.data.user.role, 'user');
  const dup = await new Agent(srv.base).post('/api/register', { username: 'unico_1', password: 'secreta123', crest: 'c02' });
  assert.equal(dup.status, 409);
  // La contraseña se guarda con hash scrypt, nunca en claro
  const [row] = await srv.db.query('SELECT pass_hash FROM users WHERE username_lower=$1', ['unico_1']);
  assert.match(row.pass_hash, /^scrypt\$/);
  assert.equal(row.pass_hash.includes('secreta123'), false);
  // Peticiones no JSON rechazadas (protección CSRF)
  const form = await fetch(srv.base + '/api/logout', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: a.cookie } });
  assert.equal(form.status, 415);
});

test('compra y apertura de sobres', async () => {
  const a = await newUser(srv, 'shop');
  const start = a.user.coins;
  const r = await a.post('/api/shop/open', { packId: 'bronce' });
  assert.equal(r.status, 200);
  const BRONCE = PACKS.find((p) => p.id === 'bronce').price;
  assert.equal(r.data.coins, start - BRONCE);
  assert.equal(r.data.cards.length, 2);
  assert.deepEqual(r.data.cards.map((c) => c.type).sort(), ['jugador', 'portero']);
  const col = (await a.get('/api/collection')).data.collection;
  assert.equal(col.reduce((s, c) => s + c.count, 0), 2);
  // Alineación asignada automáticamente con las primeras cartas
  const me = (await a.get('/api/me')).data.user;
  assert.ok(me.shooterCard && me.keeperCard);
  // Sobre inexistente y saldo insuficiente
  assert.equal((await a.post('/api/shop/open', { packId: 'trucado' })).status, 400);
  assert.equal((await a.post('/api/shop/open', { packId: 'elite' })).status, 402);
  // El cliente no puede fijar precios ni cartas: se ignoran campos extra
  const r2 = await a.post('/api/shop/open', { packId: 'bronce', price: 0, cards: ['toty-j-harry-kane'] });
  assert.equal(r2.data.coins, start - 2 * BRONCE);
});

test('compras simultáneas no permiten gastar más monedas de las que hay', async () => {
  const a = await newUser(srv, 'race');
  const price = PACKS.find((p) => p.id === 'bronce').price;
  const results = await Promise.all(Array.from({ length: 12 }, () => a.post('/api/shop/open', { packId: 'bronce' })));
  const okCount = results.filter((r) => r.status === 200).length;
  assert.equal(okCount, Math.floor(ECONOMY.startingCoins / price));
  const me = (await a.get('/api/me')).data.user;
  assert.equal(me.coins, ECONOMY.startingCoins - okCount * price);
  const [{ n }] = await srv.db.query('SELECT count(*)::int AS n FROM user_cards WHERE user_id=$1', [a.user.id]);
  assert.equal(n, okCount * 2);
});

test('probabilidades de sobres suman 100 y los caros son mejores', () => {
  const value = { bronce: 1, plata: 2, oro: 3, elite: 4, toty: 5, futties: 5, icono: 6 };
  let prev = 0;
  for (const p of PACKS.filter((x) => !x.tradable)) {
    const sum = Object.values(p.odds).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 1e-9, `${p.id} suma ${sum}`);
    const ev = Object.entries(p.odds).reduce((s, [t, o]) => s + value[t] * o, 0);
    assert.ok(ev > prev, `${p.id} debe ser mejor que el anterior`);
    prev = ev;
  }
});

test('alineación: solo cartas propias; venta de repetidas', async () => {
  const a = await newUser(srv, 'line');
  assert.equal((await a.post('/api/lineup', { shooterCard: 'j-harry-kane', keeperCard: 'p-jan-oblak' })).status, 400);
  await giveLineup(srv, a, 'j-harry-kane', 'p-jan-oblak');
  assert.equal((await a.post('/api/lineup', { shooterCard: 'p-jan-oblak', keeperCard: 'j-harry-kane' })).status, 400);
  // Sin repetidas no se puede vender
  assert.equal((await a.post('/api/collection/sell', { cardId: 'j-harry-kane' })).status, 400);
  await srv.db.query(`INSERT INTO user_cards (user_id, card_id, source) VALUES ($1,'j-harry-kane','t'),($1,'j-harry-kane','t')`, [a.user.id]);
  const before = (await a.get('/api/me')).data.user.coins;
  const s = await a.post('/api/collection/sell', { cardId: 'j-harry-kane' });
  assert.equal(s.status, 200);
  assert.equal(s.data.coins, before + ECONOMY.quickSell.elite);
  const all = await a.post('/api/collection/sell-duplicates', {});
  assert.equal(all.data.count, 1);
  const col = (await a.get('/api/collection')).data.collection;
  assert.equal(col.find((c) => c.cardId === 'j-harry-kane').count, 1);
});

async function quickWin(winner, loser) {
  const sw = await winner.connect();
  const sl = await loser.connect();
  const c = await call(sw, 'room:create');
  assert.ok(c.ok, c.error);
  assert.ok((await call(sl, 'room:join', { code: c.code })).ok);
  await waitFor(() => sw.last?.status === 'playing' || sw.last?.status === 'starting');
  await call(sl, 'room:leave'); // el perdedor abandona
  await waitFor(() => sw.last?.status === 'finished', { msg: 'victoria' });
  const res = sw.last.result;
  winner.closeAll(); loser.closeAll();
  return res;
}

test('player pick tras tres victorias seguidas', async () => {
  const p = await newUser(srv, 'pick');
  await giveLineup(srv, p, 'j-harry-kane', 'p-jan-oblak');
  const opp = await newUser(srv, 'opp');
  await giveLineup(srv, opp, 'j-harry-kane', 'p-jan-oblak');

  const r1 = await quickWin(p, opp);
  assert.equal(r1.rewards.newPick, null);
  await quickWin(p, opp);
  let picks = (await p.get('/api/picks')).data;
  assert.equal(picks.streak, 2);
  assert.equal(picks.picks.length, 0);
  const r3 = await quickWin(p, opp);
  assert.ok(r3.rewards.newPick, 'tercera victoria = player pick');
  picks = (await p.get('/api/picks')).data;
  assert.equal(picks.picks.length, 1);
  const options = picks.picks[0].options;
  assert.equal(options.length, 3);
  assert.equal(new Set(options).size, 3);
  // Recargar no cambia las opciones
  const again = (await p.get('/api/picks')).data.picks[0].options;
  assert.deepEqual(again, options);
  // Carta que no está entre las opciones -> rechazada
  const bad = await p.post(`/api/picks/${picks.picks[0].id}/claim`, { cardId: 'toty-j-harry-kane' === options[0] ? 'j-sergi-enrich' : 'toty-j-harry-kane' });
  assert.equal(bad.status, 400);
  // Reclamar una vez
  const claim = await p.post(`/api/picks/${picks.picks[0].id}/claim`, { cardId: options[1] });
  assert.equal(claim.status, 200);
  const col = (await p.get('/api/collection')).data.collection;
  assert.ok(col.some((c) => c.cardId === options[1]));
  // No se puede reclamar dos veces
  const twice = await p.post(`/api/picks/${picks.picks[0].id}/claim`, { cardId: options[0] });
  assert.equal(twice.status, 409);
  // Otro usuario no puede reclamar el pick ajeno
  const steal = await opp.post(`/api/picks/${picks.picks[0].id}/claim`, { cardId: options[0] });
  assert.equal(steal.status, 404);

  // Opciones del pick de 3 victorias: media máxima 85
  const { CARD_BY_ID } = await import('../server/cards.js');
  assert.ok(options.every((id) => CARD_BY_ID.get(id).rating <= 85), 'pick de 3 victorias: máx. 85');

  // Dos victorias más (racha 5): pick de media máxima 88
  await quickWin(p, opp); await quickWin(p, opp);
  picks = (await p.get('/api/picks')).data;
  assert.equal(picks.streak, 5);
  assert.equal(picks.picks.length, 2);
  assert.ok(picks.picks[0].options.every((id) => CARD_BY_ID.get(id).rating <= 88), 'pick de 5 victorias: máx. 88');
  // Una derrota rompe la racha; los picks conseguidos siguen ahí
  await quickWin(opp, p);
  assert.equal((await p.get('/api/picks')).data.streak, 0);
  await quickWin(p, opp); await quickWin(p, opp); await quickWin(p, opp);
  picks = (await p.get('/api/picks')).data.picks;
  assert.equal(picks.length, 3);
  assert.equal((await p.get('/api/me')).data.pendingPicks, 2);
});

test('pick de 10 victorias seguidas: media mínima 89', async () => {
  const { pickLevel } = await import('../server/config.js');
  const { CARD_BY_ID } = await import('../server/cards.js');
  const p = await newUser(srv, 'p10');
  await srv.db.query('UPDATE users SET streak=9 WHERE id=$1', [p.user.id]);
  const opp = await newUser(srv, 'o10');
  await giveLineup(srv, p, 'j-harry-kane', 'p-jan-oblak');
  await giveLineup(srv, opp, 'j-harry-kane', 'p-jan-oblak');
  const r = await quickWin(p, opp);
  assert.ok(r.rewards.newPick);
  const pk = (await p.get('/api/picks')).data.picks[0];
  assert.ok(pk.options.every((id) => CARD_BY_ID.get(id).rating >= 89));
  assert.equal(pickLevel(6), null);
  assert.equal(pickLevel(20).min, 89);
});

test('los datos se conservan tras cerrar sesión', async () => {
  const a = await newUser(srv, 'keep');
  await a.post('/api/shop/open', { packId: 'bronce' });
  const before = (await a.get('/api/me')).data;
  assert.equal((await a.post('/api/logout', {})).status, 200);
  assert.equal((await a.get('/api/me')).status, 401);
  const b = new Agent(srv.base);
  const login = await b.post('/api/login', { username: a.username, password: 'secreta123' });
  assert.equal(login.status, 200);
  const after = (await b.get('/api/me')).data;
  assert.deepEqual(after.user, before.user);
  assert.deepEqual(after.collection, before.collection);
  // Contraseña incorrecta
  assert.equal((await new Agent(srv.base).post('/api/login', { username: a.username, password: 'mala' })).status, 401);
});

test('los datos se conservan tras reiniciar el servidor (BD en disco)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'penalti-'));
  let s = await startServer({ dataDir: dir });
  const a = await newUser(s, 'disk');
  await a.post('/api/shop/open', { packId: 'bronce' });
  const before = (await a.get('/api/me')).data;
  assert.equal(before.collection.length > 0, true);
  await s.stop();
  s = await startServer({ dataDir: dir });
  const b = new Agent(s.base);
  assert.equal((await b.post('/api/login', { username: a.username, password: 'secreta123' })).status, 200);
  const after = (await b.get('/api/me')).data;
  assert.equal(after.user.coins, before.user.coins);
  assert.deepEqual(after.collection, before.collection);
  await s.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('clasificaciones con desempate estable', async () => {
  const s = await startServer();
  const users = [];
  for (let i = 0; i < 4; i++) users.push(await newUser(s, `lb${i}`));
  const set = (u, w, l) => s.db.query('UPDATE users SET wins=$2, losses=$3 WHERE id=$1', [u.user.id, w, l]);
  await set(users[0], 5, 2); await set(users[1], 5, 1); await set(users[2], 5, 2); await set(users[3], 1, 9);
  const v = (await new Agent(s.base).get('/api/leaderboard?type=victorias')).data.rows;
  assert.deepEqual(v.map((r) => r.id), [users[1].user.id, users[0].user.id, users[2].user.id, users[3].user.id]);
  assert.deepEqual(v.map((r) => r.pos), [1, 2, 3, 4]);
  assert.ok(v[0].crest && v[0].username);
  const d = (await new Agent(s.base).get('/api/leaderboard?type=derrotas')).data.rows;
  assert.equal(d[0].id, users[3].user.id);
  await s.stop();
});

test('administración: código validado en servidor, permisos y acciones', async () => {
  // Alta con el código correcto -> administrador
  const admin = await newUser(srv, 'adm', { adminCode: TEST_ADMIN_CODE });
  assert.equal(admin.user.role, 'admin');
  // Un usuario normal no tiene acceso
  const user = await newUser(srv, 'normal');
  for (const [m, p] of [['GET', '/api/admin/users'], ['GET', '/api/admin/logs'], ['POST', `/api/admin/users/${admin.user.id}/ban`],
    ['DELETE', `/api/admin/users/${admin.user.id}`], ['POST', '/api/admin/coins']]) {
    const r = await user.req(m, p, m === 'GET' ? undefined : { mode: 'add', amount: 999, confirm: admin.username });
    assert.equal(r.status, 403, `${m} ${p}`);
  }
  assert.equal((await new Agent(srv.base).get('/api/admin/users')).status, 401);
  // Promoción con login + código
  const later = await newUser(srv, 'later');
  const lg = await new Agent(srv.base).post('/api/login', { username: later.username, password: 'secreta123', adminCode: TEST_ADMIN_CODE });
  assert.equal(lg.data.user.role, 'admin');

  // Ver cuentas y conectados
  const su = await user.connect();
  const list = (await admin.get('/api/admin/users')).data.users;
  const row = list.find((u) => u.id === user.user.id);
  assert.equal(row.online, true);
  assert.equal(typeof row.wins, 'number');
  assert.equal(row.pass_hash, undefined);

  // Monedas: solo de la propia cuenta
  const add = await admin.post('/api/admin/coins', { mode: 'add', amount: 500 });
  assert.equal(add.data.coins, ECONOMY.startingCoins + 500);
  const set = await admin.post('/api/admin/coins', { mode: 'set', amount: 42 });
  assert.equal(set.data.coins, 42);
  assert.equal((await admin.post('/api/admin/coins', { mode: 'set', amount: -5 })).status, 400);
  assert.equal((await user.get('/api/me')).data.user.coins, ECONOMY.startingCoins);

  // Regalos: monedas y carta a otro jugador, con aviso en tiempo real
  const gotGift = new Promise((r) => su.once('gift', r));
  const g = await admin.post(`/api/admin/users/${user.user.id}/gift`, { coins: 300, cardId: 'p-thibaut-courtois' });
  assert.equal(g.status, 200);
  const ev = await gotGift;
  assert.equal(ev.coins, 300);
  assert.equal(ev.card.id, 'p-thibaut-courtois');
  const meGift = (await user.get('/api/me')).data;
  assert.equal(meGift.user.coins, ECONOMY.startingCoins + 300);
  assert.ok(JSON.stringify(meGift.collection).includes('p-thibaut-courtois'));
  assert.equal((await admin.post(`/api/admin/users/${user.user.id}/gift`, { coins: -5 })).status, 400);
  assert.equal((await admin.post(`/api/admin/users/${user.user.id}/gift`, { cardId: 'no-existe' })).status, 400);
  assert.equal((await admin.post(`/api/admin/users/${user.user.id}/gift`, {})).status, 400);
  assert.equal((await user.post(`/api/admin/users/${user.user.id}/gift`, { coins: 100 })).status, 403);
  // Regalar un player pick: aparece pendiente y el aviso lo indica
  const gotPick = new Promise((r) => su.once('gift', r));
  assert.equal((await admin.post(`/api/admin/users/${user.user.id}/gift`, { pick: true })).status, 200);
  assert.equal((await gotPick).pick, true);
  const upicks = (await user.get('/api/picks')).data.picks;
  assert.equal(upicks.filter((p) => !p.claimedCard).length, 1);
  assert.equal(upicks[0].options.length, 3);
  // El admin puede abrir picks para sí mismo; un usuario normal no
  assert.equal((await admin.post('/api/admin/picks', {})).status, 200);
  assert.equal((await admin.get('/api/picks')).data.picks.filter((p) => !p.claimedCard).length, 1);
  assert.equal((await user.post('/api/admin/picks', {})).status, 403);

  // A todos los conectados (el usuario está conectado)
  const all = await admin.post('/api/admin/gift-online', { coins: 50 });
  assert.equal(all.status, 200);
  assert.ok(all.data.count >= 1);
  assert.equal((await user.get('/api/me')).data.user.coins, ECONOMY.startingCoins + 350);

  // Banear: se cierra su sesión, su socket y no puede volver a entrar
  const disconnected = new Promise((r) => su.on('disconnect', r));
  assert.equal((await admin.post(`/api/admin/users/${user.user.id}/ban`, { banned: true })).status, 200);
  await disconnected;
  assert.equal((await user.get('/api/me')).status, 401);
  assert.equal((await new Agent(srv.base).post('/api/login', { username: user.username, password: 'secreta123' })).status, 403);
  await assert.rejects(user.connect());
  assert.equal((await admin.post(`/api/admin/users/${admin.user.id}/ban`, { banned: true })).status, 400);
  // Desbanear
  await admin.post(`/api/admin/users/${user.user.id}/ban`, { banned: false });
  assert.equal((await new Agent(srv.base).post('/api/login', { username: user.username, password: 'secreta123' })).status, 200);

  // Borrar exige confirmación con el nombre exacto
  assert.equal((await admin.del(`/api/admin/users/${user.user.id}`, {})).status, 400);
  assert.equal((await admin.del(`/api/admin/users/${user.user.id}`, { confirm: user.username })).status, 200);
  assert.equal((await srv.db.query('SELECT 1 FROM users WHERE id=$1', [user.user.id])).length, 0);

  // Registro de operaciones administrativas
  const logs = (await admin.get('/api/admin/logs')).data.logs.map((l) => l.action);
  for (const a of ['banear', 'desbanear', 'borrar cuenta', 'añadir monedas propias', 'fijar monedas propias']) {
    assert.ok(logs.includes(a), `falta log ${a}`);
  }
  admin.closeAll();
});

test('código de administrador incorrecto: rechazado y con intentos limitados', async () => {
  const s = await startServer();
  const statuses = [];
  for (let i = 0; i < 7; i++) {
    const r = await new Agent(s.base).post('/api/register', { username: `malo${i}x`, password: 'secreta123', crest: 'c01', adminCode: 'adivina' + i });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses.slice(0, 5), [403, 403, 403, 403, 403]);
  assert.equal(statuses[5], 429);
  // Bloqueado incluso con el código correcto mientras dure la limitación
  const r = await new Agent(s.base).post('/api/register', { username: 'bueno1', password: 'secreta123', crest: 'c01', adminCode: TEST_ADMIN_CODE });
  assert.equal(r.status, 429);
  // Las cuentas con código erróneo no se crean
  assert.equal((await s.db.query(`SELECT 1 FROM users WHERE username_lower LIKE 'malo%'`)).length, 0);
  // Dejar el campo vacío funciona con normalidad
  assert.equal((await new Agent(s.base).post('/api/register', { username: 'normal9', password: 'secreta123', crest: 'c01', adminCode: '' })).status, 201);
  await s.stop();
});

test('el código de administrador no aparece en archivos públicos ni del repositorio', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', '.git', 'data'].includes(e.name)) return [];
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
  for (const f of walk(root)) {
    if (path.basename(f) === '.env') continue; // .env está en .gitignore
    const txt = fs.readFileSync(f, 'utf8');
    assert.equal(new RegExp(['Esp', 'resso'].join(''), 'i').test(txt), false, `secreto encontrado en ${f}`);
  }
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.match(example, /ADMIN_INVITE_CODE=/);
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\.env$/m);
});

test('sobre Icono: cuesta 500.000 y trae un icono lanzador y un icono portero', async () => {
  const pack = PACKS.find((p) => p.id === 'icono');
  assert.equal(pack.price, 500000);
  const a = await newUser(srv, 'icon');
  assert.equal((await a.post('/api/shop/open', { packId: 'icono' })).status, 402);
  await srv.db.query('UPDATE users SET coins=$2 WHERE id=$1', [a.user.id, 500000]);
  const r = await a.post('/api/shop/open', { packId: 'icono' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.cards.map((c) => c.tier), ['icono', 'icono']);
  assert.deepEqual(r.data.cards.map((c) => c.type).sort(), ['jugador', 'portero']);
  assert.equal(r.data.coins, 0);
});

test('Lamine Yamal FUTTIES tiene 99 de media', async () => {
  const { CARD_BY_ID } = await import('../server/cards.js');
  const c = CARD_BY_ID.get('futties-j-lamine-yamal');
  assert.equal(c.rating, 99);
});

test('sobres transferibles: copia de cada sobre al doble de precio', () => {
  for (const p of PACKS.filter((x) => !x.tradable)) {
    const t = PACKS.find((x) => x.id === `${p.id}-t`);
    assert.ok(t && t.tradable, `falta ${p.id}-t`);
    assert.equal(t.price, p.price * 2);
    assert.deepEqual(t.odds, p.odds);
  }
});

test('mercado de transferibles: vender, pujar, superar puja, comprar ya y fin de subasta', async () => {
  const { MARKET } = await import('../server/config.js');
  const seller = await newUser(srv, 'sel');
  const b1 = await newUser(srv, 'bA');
  const b2 = await newUser(srv, 'bB');
  for (const u of [seller, b1, b2]) await srv.db.query('UPDATE users SET coins=100000 WHERE id=$1', [u.user.id]);
  // Sobre normal: cartas no transferibles; sobre transferible: sí
  const normal = await seller.post('/api/shop/open', { packId: 'bronce' });
  const ncard = normal.data.cards[0].id;
  assert.equal((await seller.post('/api/market/list', { cardId: ncard, startPrice: 200, buyNow: 1000, minutes: 60 })).status, 400);
  const opened = await seller.post('/api/shop/open', { packId: 'bronce-t' });
  assert.equal(opened.status, 200);
  const cards = opened.data.cards.map((c) => c.id);
  const col = (await seller.get('/api/collection')).data.collection;
  assert.ok(col.find((c) => c.cardId === cards[0]).tradable >= 1);

  // Poner a la venta: la carta sale de la colección (si no es la titular única)
  await seller.post('/api/lineup', { shooterCard: normal.data.cards[0].id, keeperCard: normal.data.cards[1].id });
  const listRes = await seller.post('/api/market/list', { cardId: cards[0], startPrice: 500, buyNow: 5000, minutes: 60 });
  assert.equal(listRes.status, 200, JSON.stringify(listRes.data));
  const id = listRes.data.id;
  assert.equal((await seller.post(`/api/market/${id}/bid`, { amount: 600 })).status, 400, 'no puedes pujar por lo tuyo');
  const found = (await b1.get('/api/market')).data.listings.find((l) => l.id === id);
  assert.ok(found);
  assert.equal(found.minBid, 500);

  // Puja de b1 (retiene monedas); b2 supera y a b1 se le devuelven
  assert.equal((await b1.post(`/api/market/${id}/bid`, { amount: 400 })).status, 400);
  assert.equal((await b1.post(`/api/market/${id}/bid`, { amount: 500 })).status, 200);
  assert.equal((await b1.get('/api/me')).data.user.coins, 100000 - 500);
  assert.equal((await b2.post(`/api/market/${id}/bid`, { amount: 520 })).status, 400, 'incremento mínimo');
  assert.equal((await b2.post(`/api/market/${id}/bid`, { amount: 600 })).status, 200);
  assert.equal((await b1.get('/api/me')).data.user.coins, 100000);
  assert.equal((await seller.post(`/api/market/${id}/cancel`)).status, 400, 'no se retira con pujas');

  // Comprar ya: b1 se la lleva; se devuelve la puja de b2 y el vendedor cobra el 95 %
  const sellerBefore = (await seller.get('/api/me')).data.user.coins;
  const buy = await b1.post(`/api/market/${id}/buy`);
  assert.equal(buy.status, 200);
  assert.equal((await b2.get('/api/me')).data.user.coins, 100000);
  assert.equal((await b1.get('/api/me')).data.user.coins, 100000 - 5000);
  assert.equal((await seller.get('/api/me')).data.user.coins, sellerBefore + Math.floor(5000 * (1 - MARKET.taxPct)));
  const bcol = (await b1.get('/api/collection')).data.collection.find((c) => c.cardId === cards[0]);
  assert.equal(bcol.tradable, 1, 'sigue siendo transferible');
  assert.equal((await b2.post(`/api/market/${id}/buy`)).status, 409);

  // Subasta que vence con puja: la carta va al pujador
  const l2 = (await seller.post('/api/market/list', { cardId: cards[1], startPrice: 300, buyNow: 3000, minutes: 5 })).data.id;
  await b2.post(`/api/market/${l2}/bid`, { amount: 300 });
  await srv.db.query(`UPDATE market_listings SET expires_at = now() - interval '1 second' WHERE id=$1`, [l2]);
  await b2.get('/api/market');
  assert.ok((await b2.get('/api/collection')).data.collection.some((c) => c.cardId === cards[1]));
  const mine = (await seller.get('/api/market/mine')).data;
  assert.equal(mine.selling.find((l) => l.id === l2).status, 'sold');

  // Vender de nuevo y retirarla sin pujas: vuelve a la colección
  const l3 = (await b1.post('/api/market/list', { cardId: cards[0], startPrice: 200, buyNow: 900, minutes: 5 })).data.id;
  assert.equal((await b1.post(`/api/market/${l3}/cancel`)).status, 200);
  assert.ok((await b1.get('/api/collection')).data.collection.some((c) => c.cardId === cards[0]));
});
