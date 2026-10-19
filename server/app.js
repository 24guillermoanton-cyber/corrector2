// Servidor HTTP + API + Socket.IO.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import * as auth from './auth.js';
import * as game from './game.js';
import { CARDS } from './cards.js';
import { CRESTS, ECONOMY, MATCH, PACKS, PICK, SHOT, TIERS, ZONES } from './config.js';
import { createMatchManager } from './match.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const COOKIE = 'sid';

export function createApp({ db, rng, timing } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { serveClient: true });
  const manager = createMatchManager({ io, db, rng, timing });

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: https://upload.wikimedia.org https://thumb.wikimedia.org", "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
    ].join('; '));
    next();
  });
  app.use(express.json({ limit: '10kb' }));

  // Las peticiones que modifican datos deben ser JSON (evita formularios de otros sitios: CSRF).
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'Se esperaba JSON' });
    next();
  });

  const setCookie = (req, res, token, maxAgeSec) => {
    const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
    if (req.secure || process.env.NODE_ENV === 'production') parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  };

  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    if (e instanceof game.GameError) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  async function loadUser(req) {
    const token = auth.parseCookies(req.headers.cookie)[COOKIE];
    const user = await auth.userFromToken(db, token);
    return user && !user.banned ? user : null;
  }
  const requireUser = (fn) => wrap(async (req, res) => {
    req.user = await loadUser(req);
    if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar' });
    return fn(req, res);
  });
  // Toda acción de administración se comprueba aquí, en el servidor.
  const requireAdmin = (fn) => requireUser(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo para administradores' });
    return fn(req, res);
  });
  const adminLog = (admin, action, target, details) => db.query(
    'INSERT INTO admin_logs (admin_id, admin_name, action, target, details) VALUES ($1,$2,$3,$4,$5)',
    [admin?.id ?? null, admin?.username ?? 'sistema', action, target ?? null, details ? JSON.stringify(details) : null]);

  async function meResponse(user) {
    const [collection, picks] = await Promise.all([game.getCollection(db, user.id), game.listPicks(db, user.id)]);
    return { user: game.publicUser(user), collection, pendingPicks: picks.filter((p) => !p.claimedCard).length };
  }

  // Comprueba el código de administrador si se ha escrito alguno. Limita intentos.
  async function checkAdminCode(req, username) {
    const code = typeof req.body.adminCode === 'string' ? req.body.adminCode.trim() : '';
    if (!code) return false;
    if (await auth.isLimited(db, 'admin', req.ip, username)) {
      throw new game.GameError('Demasiados intentos con el código de administrador. Espera un rato.', 429);
    }
    const ok = auth.adminCodeMatches(code);
    await auth.recordAttempt(db, 'admin', req.ip, username, ok);
    if (!ok) throw new game.GameError('Código de administrador incorrecto', 403);
    return true;
  }

  // ---------------- Datos públicos ----------------
  app.get('/api/meta', (req, res) => {
    res.json({ crests: CRESTS, packs: PACKS, economy: ECONOMY, tiers: TIERS, zones: ZONES, pick: PICK,
      match: { kicksPerTeam: MATCH.kicksPerTeam, chooseMs: MATCH.chooseMs }, shot: SHOT });
  });
  app.get('/api/cards', (req, res) => res.json({ cards: CARDS }));
  app.get('/api/leaderboard', wrap(async (req, res) => {
    const type = req.query.type === 'derrotas' ? 'derrotas' : 'victorias';
    res.json({ type, rows: await game.leaderboard(db, type) });
  }));

  // ---------------- Cuentas ----------------
  app.post('/api/register', wrap(async (req, res) => {
    const { username, password, crest } = req.body || {};
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'El nombre debe tener entre 3 y 20 caracteres (letras, números o _)' });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
      return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 100 caracteres' });
    }
    if (!CRESTS.some((c) => c.id === crest)) return res.status(400).json({ error: 'Elige un escudo' });
    if (await auth.isLimited(db, 'register', req.ip)) {
      return res.status(429).json({ error: 'Se han creado demasiadas cuentas desde esta conexión. Prueba más tarde.' });
    }
    const exists = await db.query('SELECT 1 FROM users WHERE username_lower=$1', [username.toLowerCase()]);
    if (exists.length) return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
    const isAdmin = await checkAdminCode(req, username);
    const hash = await auth.hashPassword(password);
    let user;
    try {
      [user] = await db.query(`INSERT INTO users (username, username_lower, pass_hash, crest, role, coins)
                               VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [username, username.toLowerCase(), hash, crest, isAdmin ? 'admin' : 'user', ECONOMY.startingCoins]);
    } catch (e) {
      if (String(e.message).includes('unique') || e.code === '23505') return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
      throw e;
    }
    await auth.recordAttempt(db, 'register', req.ip, username, true);
    if (isAdmin) await adminLog(user, 'alta como administrador', user.username);
    const token = await auth.createSession(db, user.id);
    setCookie(req, res, token, auth.SESSION_DAYS * 86400);
    res.status(201).json(await meResponse(user));
  }));

  app.post('/api/login', wrap(async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Faltan datos' });
    if (await auth.isLimited(db, 'login', req.ip, username)) {
      return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos.' });
    }
    let [user] = await db.query('SELECT * FROM users WHERE username_lower=$1', [username.toLowerCase()]);
    const ok = user ? await auth.verifyPassword(password, user.pass_hash) : (await auth.hashPassword(password), false);
    await auth.recordAttempt(db, 'login', req.ip, username, ok);
    if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    if (user.banned) return res.status(403).json({ error: 'Esta cuenta está baneada' });
    if (await checkAdminCode(req, username) && user.role !== 'admin') {
      [user] = await db.query(`UPDATE users SET role='admin' WHERE id=$1 RETURNING *`, [user.id]);
      await adminLog(user, 'promoción a administrador', user.username);
    }
    const token = await auth.createSession(db, user.id);
    setCookie(req, res, token, auth.SESSION_DAYS * 86400);
    res.json(await meResponse(user));
  }));

  app.post('/api/logout', wrap(async (req, res) => {
    await auth.destroySession(db, auth.parseCookies(req.headers.cookie)[COOKIE]);
    setCookie(req, res, '', 0);
    res.json({ ok: true });
  }));

  app.get('/api/me', requireUser(async (req, res) => res.json(await meResponse(req.user))));

  app.post('/api/tutorial-seen', requireUser(async (req, res) => {
    await db.query('UPDATE users SET tutorial_seen=TRUE WHERE id=$1', [req.user.id]);
    res.json({ ok: true });
  }));

  app.get('/api/users/:id', wrap(async (req, res) => {
    const [u] = await db.query('SELECT id, username, crest, wins, losses, streak, best_streak, created_at FROM users WHERE id=$1 AND NOT banned',
      [Number(req.params.id) || 0]);
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user: u });
  }));

  // ---------------- Colección y alineación ----------------
  app.get('/api/collection', requireUser(async (req, res) => res.json({ collection: await game.getCollection(db, req.user.id) })));
  app.post('/api/lineup', requireUser(async (req, res) => {
    await game.setLineup(db, req.user.id, req.body || {});
    const [u] = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    res.json({ user: game.publicUser(u) });
  }));
  app.post('/api/collection/sell', requireUser(async (req, res) => res.json(await game.quickSell(db, req.user.id, req.body?.cardId))));
  app.post('/api/collection/sell-duplicates', requireUser(async (req, res) => res.json(await game.sellAllDuplicates(db, req.user.id))));

  // ---------------- Tienda ----------------
  app.post('/api/shop/open', requireUser(async (req, res) => res.json(await game.openPack(db, req.user.id, req.body?.packId))));

  // ---------------- Player picks ----------------
  app.get('/api/picks', requireUser(async (req, res) => {
    const [u] = await db.query('SELECT streak FROM users WHERE id=$1', [req.user.id]);
    res.json({ picks: await game.listPicks(db, req.user.id), streak: u.streak, winsNeeded: PICK.winsNeeded });
  }));
  app.post('/api/picks/:id/claim', requireUser(async (req, res) => {
    const card = await game.claimPick(db, req.user.id, Number(req.params.id) || 0, req.body?.cardId);
    res.json({ card });
  }));

  // ---------------- Historial ----------------
  app.get('/api/matches', requireUser(async (req, res) => {
    const rows = await db.query(`SELECT id, home_id, away_id, home_name, away_name, winner_id, home_goals, away_goals, end_reason, status, finished_at
      FROM matches WHERE (home_id=$1 OR away_id=$1) AND status='finished' ORDER BY finished_at DESC LIMIT 15`, [req.user.id]);
    res.json({ matches: rows });
  }));

  // ---------------- Administración ----------------
  app.get('/api/admin/users', requireAdmin(async (req, res) => {
    const rows = await db.query(`SELECT id, username, crest, role, coins, wins, losses, streak, banned, created_at, last_seen
                                 FROM users ORDER BY id`);
    res.json({ users: rows.map((u) => ({ ...u, online: manager.isOnline(u.id) })) });
  }));
  app.get('/api/admin/logs', requireAdmin(async (req, res) => {
    res.json({ logs: await db.query('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 100') });
  }));
  app.post('/api/admin/users/:id/ban', requireAdmin(async (req, res) => {
    const id = Number(req.params.id) || 0;
    const banned = req.body?.banned !== false;
    if (id === req.user.id) return res.status(400).json({ error: 'No puedes banearte a ti mismo' });
    const [u] = await db.query('UPDATE users SET banned=$2 WHERE id=$1 RETURNING id, username, banned', [id, banned]);
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (banned) {
      await db.query('DELETE FROM sessions WHERE user_id=$1', [id]);
      await manager.kickUser(id, 'cuenta baneada');
      io.in(`u:${id}`).disconnectSockets(true);
    }
    await adminLog(req.user, banned ? 'banear' : 'desbanear', u.username, { id });
    res.json({ user: u });
  }));
  app.delete('/api/admin/users/:id', requireAdmin(async (req, res) => {
    const id = Number(req.params.id) || 0;
    if (id === req.user.id) return res.status(400).json({ error: 'No puedes borrar tu propia cuenta' });
    const [u] = await db.query('SELECT id, username FROM users WHERE id=$1', [id]);
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (req.body?.confirm !== u.username) {
      return res.status(400).json({ error: 'Confirma escribiendo exactamente el nombre del usuario' });
    }
    await manager.kickUser(id, 'cuenta eliminada');
    io.in(`u:${id}`).disconnectSockets(true);
    await db.query('DELETE FROM users WHERE id=$1', [id]);
    await adminLog(req.user, 'borrar cuenta', u.username, { id });
    res.json({ ok: true });
  }));
  app.post('/api/admin/coins', requireAdmin(async (req, res) => {
    const { mode, amount } = req.body || {};
    const n = Number(amount);
    if (!Number.isInteger(n) || Math.abs(n) > ECONOMY.adminMaxCoinsAdjust) return res.status(400).json({ error: 'Cantidad no válida' });
    if (!['add', 'set'].includes(mode)) return res.status(400).json({ error: 'Modo no válido' });
    if (mode === 'set' && n < 0) return res.status(400).json({ error: 'Las monedas no pueden ser negativas' });
    // Solo se modifican las monedas de la PROPIA cuenta administradora.
    const [u] = mode === 'set'
      ? await db.query('UPDATE users SET coins=$2 WHERE id=$1 RETURNING coins', [req.user.id, n])
      : await db.query('UPDATE users SET coins=GREATEST(0, coins + $2) WHERE id=$1 RETURNING coins', [req.user.id, n]);
    await adminLog(req.user, mode === 'set' ? 'fijar monedas propias' : 'añadir monedas propias', req.user.username,
      { amount: n, result: u.coins });
    res.json({ coins: u.coins });
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

  // ---------------- Archivos del cliente ----------------
  app.use(express.static(PUBLIC_DIR, { index: 'index.html', setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
  app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  // ---------------- Tiempo real ----------------
  io.use(async (socket, next) => {
    try {
      const token = auth.parseCookies(socket.handshake.headers.cookie)[COOKIE];
      const user = await auth.userFromToken(db, token);
      if (!user || user.banned) return next(new Error('no-auth'));
      socket.data.user = { id: user.id, username: user.username, crest: user.crest, role: user.role };
      next();
    } catch (e) { next(new Error('no-auth')); }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`u:${user.id}`);
    manager.onConnect(user);
    db.query('UPDATE users SET last_seen=now() WHERE id=$1', [user.id]).catch(() => {});

    const handle = (fn) => async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try { reply({ ok: true, ...(await fn(payload || {})) }); } catch (e) {
        if (!(e instanceof game.GameError)) console.error(e);
        reply({ ok: false, error: e instanceof game.GameError ? e.message : 'Error interno' });
      }
    };
    socket.on('room:create', handle(async () => ({ code: await manager.createRoom(user) })));
    socket.on('room:join', handle(async (p) => ({ code: await manager.joinRoom(user, p.code) })));
    socket.on('room:leave', handle(async () => { await manager.leave(user); return {}; }));
    socket.on('room:state', handle(async () => ({ state: manager.stateFor(user.id) })));
    socket.on('match:choose', handle(async (p) => { manager.choose(user, p.zone); return {}; }));
    socket.on('match:mark', handle(async (p) => { manager.mark(user, p.zone); return {}; }));
    socket.on('match:second', handle(async (p) => { manager.secondDive(user, p.zone); return {}; }));
    socket.on('disconnect', () => {
      manager.onDisconnect(user);
      db.query('UPDATE users SET last_seen=now() WHERE id=$1', [user.id]).catch(() => {});
    });
  });

  const cleanup = setInterval(() => {
    db.query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {});
    db.query(`DELETE FROM auth_attempts WHERE created_at < now() - interval '2 days'`).catch(() => {});
  }, 3600_000);
  cleanup.unref();

  return {
    app, server, io, manager,
    async close() { clearInterval(cleanup); await new Promise((r) => io.close(() => r())); },
  };
}
