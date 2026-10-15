// Utilidades para las pruebas end-to-end: arrancan el servidor real con una BD PGlite.
import { io as ioClient } from 'socket.io-client';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { LIMITS } from '../server/auth.js';

export const FAST = {
  chooseMs: 4000, afterKickMs: 30, secondPhaseIntroMs: 30, startCountdownMs: 30,
  disconnectGraceMs: 600, networkGraceMs: 150, waitingRoomTtlMs: 60_000,
};

LIMITS.register.max = 10_000; // en las pruebas todas las cuentas vienen de 127.0.0.1

export async function startServer({ dataDir = 'memory', timing = FAST } = {}) {
  const db = await openDb({ dataDir });
  // Generador aleatorio controlable: cola de tiradas; por defecto 0.99 (ni fuera ni parada).
  const rolls = [];
  const rng = () => (rolls.length ? rolls.shift() : 0.99);
  const srv = createApp({ db, rng, timing });
  await new Promise((r) => srv.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.server.address().port}`;
  return {
    ...srv, db, base, rolls,
    async stop() { await srv.close(); await db.close(); },
  };
}

export class Agent {
  constructor(base) { this.base = base; this.cookie = ''; this.sockets = []; }
  async req(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: { 'content-type': 'application/json', cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch { /* sin cuerpo */ }
    return { status: res.status, data };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  del(p, b = {}) { return this.req('DELETE', p, b); }

  connect() {
    const s = ioClient(this.base, { transports: ['websocket'], extraHeaders: { cookie: this.cookie }, forceNew: true, reconnection: false });
    s.states = [];
    s.results = [];
    s.on('room:state', (st) => { s.last = st; s.states.push(st); });
    s.on('kick:result', (r) => s.results.push(r));
    this.sockets.push(s);
    return new Promise((resolve, reject) => {
      s.on('connect', () => resolve(s));
      s.on('connect_error', (e) => reject(e));
    });
  }
  closeAll() { for (const s of this.sockets) s.close(); this.sockets = []; }
}

export function call(socket, ev, payload = {}) {
  return new Promise((resolve) => socket.emit(ev, payload, resolve));
}

export async function waitFor(fn, { timeout = 8000, step = 10, msg = 'condición' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`Tiempo agotado esperando: ${msg}`);
    await new Promise((r) => setTimeout(r, step));
  }
}

let counter = 0;
export async function newUser(srv, prefix = 'u', extra = {}) {
  const a = new Agent(srv.base);
  const username = `${prefix}${Date.now() % 100000}${counter++}`.slice(0, 20);
  const r = await a.post('/api/register', { username, password: 'secreta123', crest: 'c01', ...extra });
  if (r.status !== 201) throw new Error(`Registro falló: ${r.status} ${JSON.stringify(r.data)}`);
  a.user = r.data.user;
  a.username = username;
  return a;
}

// Da cartas concretas a un usuario y las pone como titulares (solo pruebas).
export async function giveLineup(srv, agent, shooterId, keeperId) {
  for (const c of [shooterId, keeperId]) {
    await srv.db.query('INSERT INTO user_cards (user_id, card_id, source) VALUES ($1,$2,$3)', [agent.user.id, c, 'test']);
  }
  const r = await agent.post('/api/lineup', { shooterCard: shooterId, keeperCard: keeperId });
  if (r.status !== 200) throw new Error('Alineación falló ' + JSON.stringify(r.data));
}

// Crea sala con A, une a B y espera a que empiece el primer lanzamiento.
export async function startRoom(a, sa, sb) {
  const c = await call(sa, 'room:create');
  if (!c.ok) throw new Error(c.error);
  const j = await call(sb, 'room:join', { code: c.code });
  if (!j.ok) throw new Error(j.error);
  await waitFor(() => sa.last?.status === 'playing' && sa.last?.cur?.phase === 'choose' && sb.last?.cur?.phase === 'choose', { msg: 'inicio' });
  return c.code;
}

// Juega el lanzamiento número `index`. side 0 = anfitrión (lanza primero).
export async function playKick(sa, sb, index, { zone, dive, rolls = [], srv }) {
  await waitFor(() => sa.last?.kicks.length === index && sa.last?.cur?.phase === 'choose' && !sa.last.cur.paused
    && sb.last?.kicks.length === index && sb.last?.cur?.phase === 'choose', { msg: `lanzamiento ${index}` });
  const shooterSock = index % 2 === 0 ? sa : sb;
  const keeperSock = index % 2 === 0 ? sb : sa;
  srv.rolls.push(...rolls);
  const r1 = await call(shooterSock, 'match:choose', { zone });
  if (!r1.ok) throw new Error(r1.error);
  const r2 = await call(keeperSock, 'match:choose', { zone: dive });
  if (!r2.ok) throw new Error(r2.error);
  return { shooterSock, keeperSock };
}
