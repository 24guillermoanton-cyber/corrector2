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
  assert.equal(r.data.coins, start - 100);
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
  assert.equal(r2.data.coins, start - 200);
});

test('compras simultáneas no permiten gastar más monedas de las que hay', async () => {
  const a = await newUser(srv, 'race');
  const price = PACKS.find((p) => p.id === 'plata').price;
  const results = await Promise.all(Array.from({ length: 12 }, () => a.post('/api/shop/open', { packId: 'plata' })));
  const okCount = results.filter((r) => r.status === 200).length;
  assert.equal(okCount, Math.floor(ECONOMY.startingCoins / price));
  const me = (await a.get('/api/me')).data.user;
  assert.equal(me.coins, ECONOMY.startingCoins - okCount * price);
  const [{ n }] = await srv.db.query('SELECT count(*)::int AS n FROM user_cards WHERE user_id=$1', [a.user.id]);
  assert.equal(n, okCount * 2);
});

test('probabilidades de sobres suman 100 y los caros son mejores', () => {
  const value = { bronce: 1, plata: 2, oro: 3, elite: 4, toty: 5, futties: 5 };
  let prev = 0;
  for (const p of PACKS) {
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

  // Dos victorias más (racha 5), luego una derrota rompe el progreso
  await quickWin(p, opp); await quickWin(p, opp);
  assert.equal((await p.get('/api/picks')).data.streak, 5);
  await quickWin(opp, p);
  assert.equal((await p.get('/api/picks')).data.streak, 0);
  // Tres victorias más: nuevo pick; el anterior sigue registrado
  await quickWin(p, opp); await quickWin(p, opp); await quickWin(p, opp);
  picks = (await p.get('/api/picks')).data.picks;
  assert.equal(picks.length, 2);
  assert.equal(picks.filter((x) => !x.claimedCard).length, 1);
  // Varios picks pendientes se acumulan hasta reclamarlos
  await quickWin(p, opp); await quickWin(p, opp); await quickWin(p, opp);
  assert.equal((await p.get('/api/me')).data.pendingPicks, 2);
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
  await a.post('/api/shop/open', { packId: 'plata' });
  const before = (await a.get('/api/me')).data;
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
