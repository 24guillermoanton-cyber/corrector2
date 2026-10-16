// Contraseñas, sesiones y limitación de intentos.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_DAYS = 30;

// Hash con scrypt (función de derivación lenta, con sal aleatoria por usuario).
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, keyB64] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length,
      { N: Number(N), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(key, expected);
  } catch { return false; }
}

// Comparación en tiempo constante del código de administrador (nunca sale del servidor).
// Limpia espacios y comillas que se cuelan al pegar el valor en el panel de Render.
export function adminSecret() {
  return (process.env.ADMIN_INVITE_CODE || '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
}

export function adminCodeMatches(input) {
  const secret = adminSecret();
  if (!secret || typeof input !== 'string' || !input) return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [sha(token), userId]);
  return token;
}

export async function userFromToken(db, token) {
  if (!token) return null;
  const rows = await db.query(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha(token)]);
  return rows[0] || null;
}

export async function destroySession(db, token) {
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha(token)]);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---- Limitación de intentos (persistida en BD para sobrevivir a reinicios) ----
export const LIMITS = {
  login: { max: 10, windowMin: 15 },     // fallos de contraseña por IP + usuario
  register: { max: 8, windowMin: 60 },   // cuentas creadas por IP
  admin: { max: 5, windowMin: 30 },      // fallos del código de administrador (por IP o por usuario)
};

export async function recordAttempt(db, kind, ip, username, success) {
  await db.query('INSERT INTO auth_attempts (kind, ip, username, success) VALUES ($1,$2,$3,$4)',
    [kind, ip, username ? username.toLowerCase() : null, success]);
}

export async function isLimited(db, kind, ip, username) {
  const { max, windowMin } = LIMITS[kind];
  let rows;
  if (kind === 'register') {
    rows = await db.query(`SELECT count(*)::int AS n FROM auth_attempts
      WHERE kind=$1 AND ip=$2 AND success AND created_at > now() - ($3 || ' minutes')::interval`, [kind, ip, String(windowMin)]);
  } else if (kind === 'admin') {
    rows = await db.query(`SELECT count(*)::int AS n FROM auth_attempts
      WHERE kind=$1 AND NOT success AND (ip=$2 OR (username IS NOT NULL AND username=$3))
      AND created_at > now() - ($4 || ' minutes')::interval`, [kind, ip, (username || '').toLowerCase(), String(windowMin)]);
  } else {
    rows = await db.query(`SELECT count(*)::int AS n FROM auth_attempts
      WHERE kind=$1 AND NOT success AND ip=$2 AND username=$3
      AND created_at > now() - ($4 || ' minutes')::interval`, [kind, ip, (username || '').toLowerCase(), String(windowMin)]);
  }
  return rows[0].n >= max;
}
