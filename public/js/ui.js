// Utilidades de interfaz: escape HTML, escudos, cartas, figuras, toasts y modales.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const TIER_NAMES = { bronce: 'Bronce', plata: 'Plata', oro: 'Oro', elite: 'Élite', toty: 'TOTY', futties: 'FUTTIES', icono: 'Icono', goat: 'GOAT 99' };
export const TIER_ORDER = ['bronce', 'plata', 'oro', 'elite', 'toty', 'futties', 'icono', 'goat'];
export const ZONE_NAMES = ['Arriba izq.', 'Arriba der.', 'Media izq.', 'Media der.', 'Abajo izq.', 'Abajo der.'];

// ---------------------------------------------------------------------
//  Escudos (SVG propio)
// ---------------------------------------------------------------------
const SHAPES = {
  shield: 'M50 4 L94 16 V58 C94 88 72 106 50 116 C28 106 6 88 6 58 V16 Z',
  round: 'M50 12 A48 48 0 1 1 49.9 12 Z',
  diamond: 'M50 4 L96 60 L50 116 L4 60 Z',
};
const SYMBOLS = {
  star: '<polygon points="50,40 56,54 71,54 59,63 63,78 50,69 37,78 41,63 29,54 44,54" />',
  ball: '<circle cx="50" cy="60" r="17" fill="#fff" stroke="#111" stroke-width="2"/><polygon points="50,52 57,57 54,65 46,65 43,57" fill="#111"/><path d="M50 43v9M57 57l9-4M54 65l6 8M46 65l-6 8M43 57l-9-4" stroke="#111" stroke-width="2"/>',
  crown: '<path d="M30 72 L32 48 L41 58 L50 42 L59 58 L68 48 L70 72 Z" /><rect x="30" y="73" width="40" height="6" rx="2"/>',
  bolt: '<polygon points="56,38 36,64 49,64 44,84 66,56 53,56" />',
  sun: '<circle cx="50" cy="60" r="10"/><g stroke-width="4" stroke-linecap="round" class="rays"><path d="M50 40v-5M50 80v5M30 60h-5M70 60h5M36 46l-4-4M64 74l4 4M64 46l4-4M36 74l-4 4"/></g>',
  wave: '<path d="M26 56 q6 -8 12 0 t12 0 t12 0 t12 0 M26 68 q6 -8 12 0 t12 0 t12 0 t12 0" fill="none" stroke-width="5" stroke-linecap="round" class="rays"/>',
  lion: '<circle cx="50" cy="60" r="18"/><circle cx="50" cy="61" r="11" class="face"/><circle cx="46" cy="58" r="1.6" class="eye"/><circle cx="54" cy="58" r="1.6" class="eye"/><path d="M47 65 q3 3 6 0" fill="none" stroke-width="1.6" class="mouth"/>',
};
let crestSeq = 0;
export function crestSVG(crest, { size } = {}) {
  if (!crest) return '';
  const id = `cr${crestSeq++}`;
  const { shape, c1, c2, pattern, symbol } = crest;
  const d = SHAPES[shape] || SHAPES.shield;
  const pat = {
    plain: '',
    stripes: `<g fill="${c2}"><rect x="22" y="0" width="12" height="120"/><rect x="46" y="0" width="12" height="120"/><rect x="70" y="0" width="12" height="120"/></g>`,
    half: `<rect x="50" y="0" width="50" height="120" fill="${c2}"/>`,
    sash: `<polygon points="0,30 30,0 100,90 100,120 80,120" fill="${c2}"/>`,
    chevron: `<polygon points="0,40 50,80 100,40 100,62 50,102 0,62" fill="${c2}"/>`,
    cross: `<g fill="${c2}"><rect x="42" y="0" width="16" height="120"/><rect x="0" y="52" width="100" height="16"/></g>`,
  }[pattern] || '';
  const symFill = pattern === 'plain' ? c2 : '#fff';
  const sym = (SYMBOLS[symbol] || '').replace('class="face"', `fill="${c1}"`).replace(/class="eye"/g, `fill="${c2}"`)
    .replace('class="mouth"', `stroke="${c2}"`).replace(/class="rays"/g, `stroke="${symFill}"`);
  const s = size ? `width="${size}" height="${size * 1.2}"` : '';
  return `<svg viewBox="0 0 100 120" ${s} aria-hidden="true"><defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>
    <g clip-path="url(#${id})"><rect width="100" height="120" fill="${c1}"/>${pat}
    <circle cx="50" cy="60" r="24" fill="rgba(0,0,0,0.25)"/></g>
    <g fill="${symFill}">${sym}</g>
    <path d="${d}" fill="none" stroke="#0b0b0b" stroke-width="4"/><path d="${d}" fill="none" stroke="${c2}" stroke-width="1.5" transform="translate(50 60) scale(0.9) translate(-50 -60)"/></svg>`;
}

// ---------------------------------------------------------------------
//  Figuras (diseño propio, sin fotos)
// ---------------------------------------------------------------------
function initials(name) {
  const parts = name.split(/[\s-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : parts[0].slice(0, 2)).toUpperCase();
}
export function portraitSVG(card) {
  const kit = { bronce: '#7a4a20', plata: '#5d6b79', oro: '#a07800', elite: '#ffd86b', toty: '#0b2a9c', futties: '#7a0c55', icono: '#f3e7c4', goat: '#1a0000' }[card.tier];
  const num = { bronce: '#fff', plata: '#fff', oro: '#fff', elite: '#1a1408', toty: '#ffd86b', futties: '#fff', icono: '#6b4e00', goat: '#ffd54a' }[card.tier];
  const gloves = card.type === 'portero'
    ? `<circle cx="12" cy="88" r="9" fill="#27e36f" stroke="#0a0a0a" stroke-width="2"/><circle cx="88" cy="88" r="9" fill="#27e36f" stroke="#0a0a0a" stroke-width="2"/>` : '';
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <path d="M8 100 C10 72 28 62 50 62 C72 62 90 72 92 100 Z" fill="${kit}" stroke="rgba(0,0,0,0.35)" stroke-width="2"/>
    <path d="M38 62 L50 76 L62 62" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="3"/>
    <rect x="44" y="50" width="12" height="14" rx="4" fill="#c99a78"/>
    <ellipse cx="50" cy="36" rx="17" ry="20" fill="#d7a983"/>
    <path d="M33 34 C33 16 67 14 67 32 C62 24 40 24 33 34 Z" fill="#2a1b10"/>
    <text x="50" y="94" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="20" fill="${num}">${esc(initials(card.name))}</text>
    ${gloves}</svg>`;
}

export function keeperFigure(color = '#ffcc00') {
  return `<svg viewBox="0 0 80 100" aria-hidden="true">
    <circle cx="40" cy="14" r="10" fill="#d7a983"/><path d="M30 10 q10 -12 20 0" fill="#2a1b10"/>
    <path d="M24 28 h32 l4 34 h-40 z" fill="${color}" stroke="#111" stroke-width="2"/>
    <path d="M24 30 L6 12" stroke="${color}" stroke-width="9" stroke-linecap="round"/><path d="M56 30 L74 12" stroke="${color}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="5" cy="10" r="7" fill="#27e36f" stroke="#111" stroke-width="2"/><circle cx="75" cy="10" r="7" fill="#27e36f" stroke="#111" stroke-width="2"/>
    <path d="M28 62 L22 96" stroke="#222" stroke-width="10" stroke-linecap="round"/><path d="M52 62 L58 96" stroke="#222" stroke-width="10" stroke-linecap="round"/></svg>`;
}
export function shooterFigure(color = '#e33') {
  return `<svg viewBox="0 0 60 100" aria-hidden="true">
    <circle cx="30" cy="12" r="9" fill="#d7a983"/><path d="M21 9 q9 -11 18 0" fill="#2a1b10"/>
    <path d="M18 24 h24 l3 32 h-30 z" fill="${color}" stroke="#111" stroke-width="2"/>
    <path d="M18 28 L8 50" stroke="${color}" stroke-width="7" stroke-linecap="round"/><path d="M42 28 L52 50" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    <path d="M22 56 L18 96" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M38 56 L44 96" stroke="#fff" stroke-width="8" stroke-linecap="round"/></svg>`;
}
export const BALL_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#fff" stroke="#222" stroke-width="2"/>
  <polygon points="20,13 26,17 24,24 16,24 14,17" fill="#222"/><path d="M20 3v10M26 17l9-4M24 24l6 9M16 24l-6 9M14 17l-9-4" stroke="#222" stroke-width="1.6"/></svg>`;

// ---------------------------------------------------------------------
//  Cartas
// ---------------------------------------------------------------------
const STAT_LABELS = {
  jugador: [['precision', 'PRE'], ['potencia', 'POT'], ['calidad', 'CAL']],
  portero: [['reflejos', 'REF'], ['parada', 'PAR'], ['reincorporacion', 'REI']],
};
export const STAT_NAMES = {
  precision: 'Precisión de penalti', potencia: 'Potencia', calidad: 'Calidad de lanzamiento',
  reflejos: 'Reflejos', parada: 'Capacidad de parada', reincorporacion: 'Reincorporación',
};
const NATION_CODES = {};
function natCode(n) {
  if (NATION_CODES[n]) return NATION_CODES[n];
  const c = n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean);
  return (NATION_CODES[n] = (c.length > 1 && c[0].length <= 3 ? c.map((w) => w[0]).join('') : c[0].slice(0, 3)).toUpperCase().slice(0, 3));
}

// Fotos con licencia libre (Wikimedia Commons). Se cargan desde /data/photos.json.
let PHOTOS = {};
export function setPhotos(map) { PHOTOS = map || {}; }
export const photoOf = (card) => card && PHOTOS[card.name];
export function photoCredit(card) {
  const p = photoOf(card);
  if (!p) return '<span class="muted">Ilustración propia (no hay foto con licencia libre disponible).</span>';
  const lic = p.licenseUrl ? `<a href="${esc(p.licenseUrl)}" target="_blank" rel="noopener">${esc(p.license)}</a>` : esc(p.license);
  return `Foto: <a href="${esc(p.file)}" target="_blank" rel="noopener">${esc(p.author)}</a>, ${lic}, vía Wikimedia Commons`;
}
// Si una foto no carga, se ve la ilustración propia que hay debajo.
document.addEventListener('error', (e) => {
  if (!e.target.classList?.contains('f-photo')) return;
  e.target.classList.add('broken');
  e.target.parentElement?.classList.remove('has-photo');
}, true);

// Capas de efectos de las cartas especiales (aura, holograma, partículas y borde giratorio)
function specialFx(tier) {
  const n = tier === 'toty' ? 9 : 10;
  let parts = '';
  for (let i = 0; i < n; i++) {
    parts += `<i style="--x:${((i * 37 + 11) % 92) + 4}%;--d:${((i * 0.73) % 3).toFixed(2)}s;--t:${(2.6 + (i % 4) * 0.5).toFixed(1)}s;--s:${(0.5 + (i % 3) * 0.22).toFixed(2)}em"></i>`;
  }
  return `<div class="fx fx-aura"></div><div class="fx fx-holo"></div><div class="fx fx-parts">${parts}</div>`;
}

// El brillo holográfico de las especiales sigue al puntero
document.addEventListener('pointermove', (e) => {
  const c = e.target.closest?.('.fcard.t-toty, .fcard.t-futties, .fcard.t-icono, .fcard.t-goat');
  if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  c.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
});

// Carta estilo "ultimate": borde metálico con forma de escudo, foto a sangre fundida
// con el fondo de la categoría y datos superpuestos (media, posición, nombre, estadísticas).
const TYPE_ICON = {
  jugador: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z" fill="currentColor"/></svg>',
  portero: '<svg viewBox="0 0 24 24"><path d="M7 21v-7l-2-3V6a1.5 1.5 0 013 0v4h1V4a1.5 1.5 0 013 0v6h1V5a1.5 1.5 0 013 0v5h1V7a1.5 1.5 0 013 0v7l-3 7z" fill="currentColor"/></svg>',
};
export function cardHTML(card, { count, selected, extraClass = '', missing = false, attrs = '', tradable = 0 } = {}) {
  if (!card) return '';
  card = { ...card, type: card.type || (card.position === 'POR' ? 'portero' : 'jugador') };
  const stats = STAT_LABELS[card.type].map(([k, l]) => `<div><span>${l}</span><b>${card.stats[k]}</b></div>`).join('');
  const special = ['toty', 'futties', 'icono', 'goat'].includes(card.tier);
  const photo = photoOf(card);
  const nameSize = card.name.length > 18 ? 0.7 : card.name.length > 14 ? 0.8 : card.name.length > 11 ? 0.92 : 1;
  return `<div class="fcard t-${card.tier} ${extraClass} ${missing ? 'missing' : ''}" data-card="${esc(card.id)}" ${attrs}
      title="${esc(card.name)} · ${card.rating} · ${TIER_NAMES[card.tier]}">
    <div class="fc-body"><div class="fc-inner">
      <div class="fc-bgart"></div>
      ${special ? specialFx(card.tier) : ''}
      <div class="fc-photo ${photo ? 'has-photo' : ''}">${portraitSVG(card)}${photo
        ? `<img class="f-photo" src="${esc(photo.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false">` : ''}</div>
      <div class="fc-left">
        <span class="fc-rating">${card.rating}</span>
        <span class="fc-pos">${esc(card.position)}</span>
        <span class="fc-chip" title="${card.type === 'portero' ? 'Portero' : 'Lanzador'}">${TYPE_ICON[card.type]}</span>
        <span class="fc-chip fc-nat" title="${esc(card.nation)}">${esc(natCode(card.nation))}</span>
      </div>
      <div class="fc-cat">${TIER_NAMES[card.tier]}</div>
      <div class="fc-name" style="--ns:${nameSize}">${esc(card.name)}</div>
      <div class="fc-stats">${stats}</div>
      <div class="fc-foot"><span>${esc(card.nation)}</span><i></i><span>${card.type === 'portero' ? 'PORTERO' : 'LANZADOR'}</span></div>
      ${special ? '<div class="sparkles"></div>' : ''}
    </div></div>
    ${count > 1 ? `<span class="f-count">x${count}</span>` : ''}
    ${tradable ? `<span class="f-trade" title="${tradable} transferible${tradable > 1 ? 's' : ''}">⇄${tradable > 1 ? tradable : ''}</span>` : ''}
    ${selected ? `<span class="f-sel">TITULAR</span>` : ''}
  </div>`;
}

export function statBars(card) {
  return `<div class="statbars">${STAT_LABELS[card.type].map(([k]) => `
    <div class="statbar"><span>${STAT_NAMES[k]}</span><div class="bar"><i style="width:${card.stats[k]}%"></i></div><b>${card.stats[k]}</b></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------------
//  Toasts y modales
// ---------------------------------------------------------------------
export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function modal(html, { wide = false, onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal panel ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { back.remove(); onClose?.(); };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  $('#overlay-root').appendChild(back);
  return { el: back.firstElementChild, close };
}

export function confirmModal(title, text, { okText = 'Confirmar', danger = false, input } = {}) {
  return new Promise((resolve) => {
    const m = modal(`<h2>${esc(title)}</h2><p>${text}</p>
      ${input ? `<input id="confirm-input" autocomplete="off" placeholder="${esc(input)}">` : ''}
      <div class="modal-actions"><button class="btn" data-close>Cancelar</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${esc(okText)}</button></div>`,
    { onClose: () => resolve(null) });
    $('#confirm-ok', m.el).addEventListener('click', () => {
      const v = input ? $('#confirm-input', m.el).value : true;
      resolve(v); m.el.parentElement.remove();
    });
    $('#confirm-input', m.el)?.focus();
  });
}

export function burst(container, { count = 40, colors = ['#fff'], spread = 420, star = false, x = '50%', y = '50%' } = {}) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = `particle ${star ? 'star' : ''}`;
    const a = Math.random() * Math.PI * 2;
    const d = spread * (0.35 + Math.random() * 0.65);
    p.style.cssText = `left:${x};top:${y};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--pc:${colors[i % colors.length]};--pd:${0.9 + Math.random() * 0.9}s;--rot:${Math.random() * 720}deg`;
    container.appendChild(p);
    setTimeout(() => p.remove(), 2000);
  }
}
export function rain(container, { count = 50, colors = ['#fff'], star = false, duration = 3 } = {}) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = `particle fall ${star ? 'star' : ''}`;
    p.style.cssText = `left:${Math.random() * 100}%;--pc:${colors[i % colors.length]};--pd:${duration * (0.6 + Math.random() * 0.8)}s;--dx:${(Math.random() - 0.5) * 120}px;animation-delay:${Math.random() * 1.2}s`;
    container.appendChild(p);
    setTimeout(() => p.remove(), (duration * 1.4 + 1.3) * 1000);
  }
}
