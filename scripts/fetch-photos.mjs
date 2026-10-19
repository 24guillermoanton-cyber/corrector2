// Busca una foto con licencia libre (Wikimedia Commons) para cada carta y guarda
// la URL, el autor y la licencia en public/data/photos.json.
// Uso: node scripts/fetch-photos.mjs            (todas)
//      node scripts/fetch-photos.mjs --missing  (solo las cartas que aún no tienen foto, p. ej. iconos nuevos)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS } from '../server/cards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data', 'photos.json');
const UA = 'PenaltiStars/1.0 (juego educativo; fotos de Wikimedia Commons con atribucion)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' } });
    if (r.status === 429) { await sleep(15_000 * (i + 1)); continue; }
    return r.ok ? r.json() : null;
  }
  return null;
}
const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// 1) Wikipedia: archivo de la imagen principal del artículo del jugador
async function findFile(name) {
  const tries = [
    ['en', `${name} (footballer)`], ['en', `${name} (Spanish footballer)`], ['en', name],
    ['es', name], ['es', `${name} (futbolista)`],
  ];
  for (const [lang, t] of tries) {
    const s = await get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`);
    await sleep(150);
    if (!s || s.type !== 'standard' || !s.originalimage) continue;
    if (!/football|futbol|goalkeeper|portero|guardameta/i.test(`${s.description || ''} ${s.extract || ''}`)) continue;
    const src = s.originalimage.source.split('?')[0];
    if (!src.includes('/wikipedia/commons/')) continue; // solo archivos de Commons (licencias libres)
    return decodeURIComponent(src.split('/').pop());
  }
  return null;
}

const names = [...new Set(CARDS.map((c) => c.name))];
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const missingOnly = process.argv.includes('--missing');
const files = {};
// --refresh: reutiliza los archivos ya elegidos y solo vuelve a pedir la miniatura (p. ej. a mayor resolución)
if (process.argv.includes('--refresh') && fs.existsSync(OUT)) {
  for (const [name, p] of Object.entries(JSON.parse(fs.readFileSync(OUT, 'utf8')))) files[name] = decodeURIComponent(p.file.split('File:')[1]);
}
for (const name of process.argv.includes('--refresh') ? [] : missingOnly ? names.filter((n) => !prev[n]) : names) {
  const f = await findFile(name);
  if (f) files[name] = f;
  console.log(`${f ? '·' : '✖'} ${name}`);
}

// 2) Commons: autor, licencia y miniatura, en lotes
const out = missingOnly ? { ...prev } : {};
const entries = Object.entries(files);
for (let i = 0; i < entries.length; i += 40) {
  const batch = entries.slice(i, i + 40);
  const titles = batch.map(([, f]) => `File:${f}`).join('|');
  const info = await get(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1000&titles=${encodeURIComponent(titles)}`);
  await sleep(1500);
  if (!info) continue;
  const norm = new Map((info.query.normalized || []).map((n) => [n.to, n.from]));
  const byTitle = new Map(Object.values(info.query.pages).map((p) => [norm.get(p.title) || p.title, p]));
  for (const [name, f] of batch) {
    const p = byTitle.get(`File:${f}`) || byTitle.get(`File:${f.replace(/_/g, ' ')}`);
    const ii = p?.imageinfo?.[0];
    if (!ii) continue;
    const md = ii.extmetadata || {};
    const license = strip(md.LicenseShortName?.value);
    if (!/CC|public domain|dominio p|PD/i.test(license)) continue;
    out[name] = {
      src: ii.thumburl || ii.url,
      file: ii.descriptionurl,
      author: strip(md.Artist?.value).slice(0, 120) || 'Desconocido',
      license,
      licenseUrl: md.LicenseUrl?.value || null,
    };
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`\n${Object.keys(out).length}/${names.length} fotos con licencia libre guardadas en ${path.relative(ROOT, OUT)}`);
console.log('Sin foto:', names.filter((n) => !out[n]).join(', ') || 'ninguno');
