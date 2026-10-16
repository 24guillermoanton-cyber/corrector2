// Punto de entrada: node server/index.js
import { openDb } from './db.js';
import { createApp } from './app.js';
import { adminSecret } from './auth.js';

const PORT = Number(process.env.PORT) || 3000;

const db = await openDb({ databaseUrl: process.env.DATABASE_URL, dataDir: process.env.DATA_DIR });
const { server, close } = createApp({ db });

if (!adminSecret()) {
  console.warn('[aviso] ADMIN_INVITE_CODE no está definida: nadie podrá obtener el rol de administrador.');
} else {
  console.log(`[admin] ADMIN_INVITE_CODE cargada (${adminSecret().length} caracteres)`);
}
console.log(process.env.DATABASE_URL
  ? '[bd] Usando PostgreSQL (DATABASE_URL)'
  : `[bd] Usando PGlite (PostgreSQL embebido) en ${process.env.DATA_DIR || './data/pglite'}`);

server.listen(PORT, () => console.log(`Penalti Stars escuchando en http://localhost:${PORT}`));

async function shutdown() {
  console.log('Cerrando…');
  await close().catch(() => {});
  await db.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
