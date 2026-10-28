// Penalti Stars — cliente. Navegación, pantallas y comunicación con el servidor.
import { $, $$, esc, crestSVG, cardHTML, statBars, toast, modal, confirmModal, setPhotos, photoCredit, TIER_NAMES, TIER_ORDER, STAT_NAMES } from './ui.js';
import { sfx, isMuted, setMuted } from './sound.js';
import { openPackAnimation } from './pack.js';
import { renderSala } from './match.js';
import { showGift } from './gift.js';

const app = $('#app');

// ---------------------------------------------------------------------
//  Estado global y utilidades
// ---------------------------------------------------------------------
const state = {
  me: null, collection: [], pendingPicks: 0, meta: null, cards: new Map(), room: null, socket: null,
  crestById(id) { return state.meta.crests.find((c) => c.id === id) || state.meta.crests[0]; },
};
const bus = (() => {
  const subs = {};
  return {
    on(ev, fn) { (subs[ev] ||= new Set()).add(fn); return () => subs[ev].delete(fn); },
    emit(ev, data) { subs[ev]?.forEach((fn) => fn(data)); },
  };
})();

async function api(method, path, body) {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* vacío */ }
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    if (res.status === 401 && state.me && path !== '/api/login') onLoggedOut('Tu sesión ha caducado');
    throw err;
  }
  return data;
}

function applyMe(data) {
  if (data.user) {
    const prevCoins = state.me?.coins;
    state.me = data.user;
    if (prevCoins != null && prevCoins !== data.user.coins) {
      const chip = $('#coins-chip'); chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
    }
  }
  if (data.collection) state.collection = data.collection;
  if (data.pendingPicks != null) state.pendingPicks = data.pendingPicks;
  renderHeader();
}
async function refreshMe() {
  try { applyMe(await api('GET', '/api/me')); } catch { /* sesión caducada gestionada en api() */ }
}
function setCoins(coins) { if (state.me) { state.me.coins = coins; renderHeader(); } }

function renderHeader() {
  const me = state.me;
  $('#topbar').hidden = !me;
  if (!me) return;
  $('#coins-chip').textContent = `🪙 ${me.coins.toLocaleString('es-ES')}`;
  $('#me-link').innerHTML = `${crestSVG(state.crestById(me.crest))}<span class="me-name">${esc(me.username)}</span>`;
  $('#nav-admin').hidden = me.role !== 'admin';
  const b = $('#picks-badge');
  b.hidden = !state.pendingPicks; b.textContent = state.pendingPicks;
  $('#mute-btn').textContent = isMuted() ? '🔇' : '🔊';
}

// ---------------------------------------------------------------------
//  Tiempo real
// ---------------------------------------------------------------------
function connectSocket() {
  if (state.socket) return;
  const s = window.io({ withCredentials: true });
  state.socket = s;
  let lostToast = null;
  s.on('connect', () => {
    if (lostToast) { toast('Conexión recuperada'); lostToast = null; }
    s.emit('room:state', {}, (r) => { if (r?.ok) setRoom(r.state); });
  });
  s.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') return; // expulsado (baneo)
    lostToast = true;
    toast('Conexión perdida. Reconectando…', 'err');
  });
  s.on('connect_error', (e) => {
    if (e.message === 'no-auth') { s.disconnect(); onLoggedOut('Tu sesión no es válida o la cuenta está suspendida'); }
  });
  s.on('room:state', (st) => setRoom(st));
  s.on('room:closed', ({ reason }) => { toast(reason || 'La sala se ha cerrado'); state.room = null; bus.emit('room'); });
  s.on('kick:result', (r) => bus.emit('kick', r));
  s.on('match:end', (r) => { bus.emit('end', r); refreshMe(); });
  s.on('market', (ev) => {
    const n = (x) => Number(x || 0).toLocaleString('es-ES');
    const msg = {
      outbid: [`Te han superado la puja por ${ev.card}. Te devolvemos ${n(ev.amount)} 🪙`, 'err'],
      bid: [`Nueva puja de ${n(ev.amount)} 🪙 por tu ${ev.card}`, ''],
      sold: [`¡Has vendido ${ev.card}! +${n(ev.amount)} 🪙`, 'gold'],
      won: [`¡Has ganado la subasta de ${ev.card}!`, 'gold'],
      expired: [`Nadie compró ${ev.card}: vuelve a tu colección`, ''],
    }[ev.type];
    if (msg) toast(msg[0], msg[1]);
    if (ev.type === 'sold' || ev.type === 'won') sfx.coins();
    refreshMe();
    bus.emit('market', ev);
  });
  s.on('gift', (g) => {
    refreshMe();
    showGift(g, { getCard: (id) => state.cards.get(id), onPicks: () => { location.hash = '#/picks'; } });
  });
}
function setRoom(st) {
  const prev = state.room;
  state.room = st;
  if (st && ['waiting', 'starting', 'playing'].includes(st.status) && currentRoute().name !== 'sala') {
    if (!prev || prev.code !== st.code || st.status !== 'waiting') location.hash = '#/sala';
  }
  bus.emit('room', st);
}
async function emit(ev, payload = {}) {
  const s = state.socket;
  if (s && !s.connected) {
    // Espera breve a que el socket termine de conectar (p. ej. al entrar por un enlace de invitación)
    await new Promise((r) => { const t = setTimeout(r, 6000); s.once('connect', () => { clearTimeout(t); r(); }); });
  }
  return new Promise((resolve) => {
    if (!state.socket?.connected) return resolve({ ok: false, error: 'Sin conexión con el servidor' });
    const t = setTimeout(() => resolve({ ok: false, error: 'El servidor no responde' }), 8000);
    state.socket.emit(ev, payload, (r) => { clearTimeout(t); resolve(r || { ok: false }); });
  });
}

function onLoggedOut(msg) {
  state.me = null; state.room = null;
  state.socket?.disconnect(); state.socket = null;
  renderHeader();
  if (msg) toast(msg, 'err');
  location.hash = '#/acceso';
  route();
}

// ---------------------------------------------------------------------
//  Router
// ---------------------------------------------------------------------
const routes = {};
let cleanup = null;
function currentRoute() {
  const [name = 'inicio', ...params] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name, params };
}
function route() {
  cleanup?.(); cleanup = null;
  let { name, params } = currentRoute();
  if (!state.me) {
    if (name !== 'acceso') { try { sessionStorage.setItem('ps-after-login', location.hash); } catch { /* nada */ } }
    name = 'acceso';
  } else if (name === 'acceso') name = 'inicio';
  if (!routes[name]) name = 'inicio';
  if (name === 'admin' && state.me?.role !== 'admin') name = 'inicio';
  if (name !== 'sala' && state.room?.status === 'finished') state.room = null;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  window.scrollTo(0, 0);
  cleanup = routes[name](params) || null;
}
window.addEventListener('hashchange', route);

// ---------------------------------------------------------------------
//  Acceso: registro e inicio de sesión
// ---------------------------------------------------------------------
routes.acceso = () => {
  let mode = 'login';
  let crest = null;
  const sample = ['j-harry-kane', 'toty-p-thibaut-courtois', 'futties-j-lamine-yamal'].map((id) => state.cards.get(id)).filter(Boolean);
  app.innerHTML = `<div class="auth-wrap fade-in">
    <div class="auth-hero">
      <h1>PENALTI<span>STARS</span></h1>
      <p>Colecciona futbolistas, abre sobres y reta a tus amigos a tandas de penaltis en tiempo real.</p>
      <div class="auth-cards">${sample.map((c) => cardHTML(c)).join('')}</div>
    </div>
    <div class="panel">
      <div class="tabs" style="margin-bottom:8px"><button data-m="login" class="active">Entrar</button><button data-m="register">Crear cuenta</button></div>
      <form id="auth-form" autocomplete="on">
        <label>Nombre de usuario</label>
        <input name="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" autocomplete="username" placeholder="Ej: Pichichi_10">
        <label>Contraseña</label>
        <input name="password" type="password" required minlength="6" maxlength="100" autocomplete="current-password" placeholder="Mínimo 6 caracteres">
        <div id="crest-block" hidden>
          <label>Elige el escudo de tu equipo</label>
          <div class="crest-picker">${state.meta.crests.map((c) => `<button type="button" class="crest-opt" data-crest="${c.id}" title="${esc(c.name)}">${crestSVG(c)}</button>`).join('')}</div>
          <div class="crest-name" id="crest-name">Ningún escudo elegido</div>
        </div>
        <label>Código de administrador <small>(opcional, déjalo vacío si no tienes)</small></label>
        <input name="adminCode" type="password" autocomplete="off" maxlength="100" placeholder="Solo para administradores">
        <p class="form-error" id="auth-err"></p>
        <button class="btn btn-primary btn-lg btn-block" id="auth-submit">Entrar</button>
      </form>
    </div></div>`;
  $$('.auth-cards .fcard').forEach((c) => c.style.setProperty('--w', '130px'));
  const setMode = (m) => {
    mode = m;
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.m === m));
    $('#crest-block').hidden = m !== 'register';
    $('#auth-submit').textContent = m === 'register' ? 'Crear cuenta' : 'Entrar';
    $('[name=password]').autocomplete = m === 'register' ? 'new-password' : 'current-password';
    $('#auth-err').textContent = '';
  };
  $$('.tabs button').forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
  $$('.crest-opt').forEach((b) => (b.onclick = () => {
    crest = b.dataset.crest; sfx.select();
    $$('.crest-opt').forEach((x) => x.classList.toggle('selected', x === b));
    $('#crest-name').textContent = state.crestById(crest).name;
  }));
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { username: f.get('username').trim(), password: f.get('password'), adminCode: f.get('adminCode') };
    if (mode === 'register') {
      if (!crest) { $('#auth-err').textContent = 'Elige un escudo para tu equipo'; return; }
      body.crest = crest;
    }
    $('#auth-submit').disabled = true;
    try {
      const data = await api('POST', mode === 'register' ? '/api/register' : '/api/login', body);
      applyMe(data);
      sfx.whistle();
      connectSocket();
      toast(mode === 'register' ? `¡Bienvenido, ${data.user.username}! Tienes ${data.user.coins} monedas para tus primeros sobres.` : `¡Hola de nuevo, ${data.user.username}!`, 'gold');
      if (data.user.role === 'admin' && body.adminCode) toast('Rol de administrador activo');
      let next = '#/inicio';
      try { next = sessionStorage.getItem('ps-after-login') || next; sessionStorage.removeItem('ps-after-login'); } catch { /* nada */ }
      if (next.includes('acceso')) next = '#/inicio';
      if (location.hash === next) route(); else location.hash = next;
    } catch (err) {
      $('#auth-err').textContent = err.message; sfx.alarm();
    } finally { const b = $('#auth-submit'); if (b) b.disabled = false; }
  };
};

// ---------------------------------------------------------------------
//  Inicio
// ---------------------------------------------------------------------
function streakHTML(streak) {
  const need = state.meta.pick.winsNeeded;
  const prog = streak % need;
  return `<div class="streak">${Array.from({ length: need }, (_, i) => `<span class="dot ${i < prog ? 'on' : ''}">${i < prog ? '★' : ''}</span>`).join('')}
    <span class="muted">${prog}/${need} hacia el próximo player pick</span></div>`;
}
function profileHero(u) {
  return `<div class="profile-hero">
    <div class="crest-big">${crestSVG(state.crestById(u.crest))}</div>
    <div><h1>${esc(u.username)}</h1>
      <div class="wl"><span class="win">${u.wins}<small>VICTORIAS</small></span><span class="loss">${u.losses}<small>DERROTAS</small></span></div>
      <p class="muted" style="margin:6px 0 0">${esc(state.crestById(u.crest).name)}${u.role === 'admin' ? ' · 🛡️ Administrador' : ''}</p></div></div>`;
}

routes.inicio = () => {
  const me = state.me;
  const shooter = state.cards.get(me.shooterCard);
  const keeper = state.cards.get(me.keeperCard);
  app.innerHTML = `<div class="fade-in grid">
    <div class="panel"><div class="row">${profileHero(me)}<div class="spacer"></div>
      <div><p style="margin:0 0 6px"><b>Racha actual: ${me.streak}</b></p>${streakHTML(me.streak)}</div></div></div>
    ${state.room && state.room.status !== 'finished' ? `<a class="banner info" href="#/sala" style="display:block;text-decoration:none">🎮 Tienes una sala activa (${esc(state.room.code)}). Toca para volver.</a>` : ''}
    <div class="grid cta-grid">
      <a class="cta-card cta-play" href="#/sala"><span class="big-emoji">⚽</span><h3>Jugar con un amigo</h3><p>Crea una sala privada y comparte el código</p></a>
      <a class="cta-card cta-shop" href="#/tienda"><span class="big-emoji">🎴</span><h3>Abrir sobres</h3><p>Tienes ${me.coins.toLocaleString('es-ES')} monedas</p></a>
      <a class="cta-card cta-picks" href="#/picks"><span class="big-emoji">🎁</span><h3>Player picks</h3><p>${state.pendingPicks ? `¡${state.pendingPicks} pendiente${state.pendingPicks > 1 ? 's' : ''} de reclamar!` : '3 victorias seguidas = 1 pick'}</p></a>
      <a class="cta-card cta-rank" href="#/clasificacion"><span class="big-emoji">🏆</span><h3>Clasificación</h3><p>Victorias y derrotas de todos</p></a>
    </div>
    <div class="panel"><div class="screen-title"><h2>Tus titulares</h2><div class="row"><a class="btn btn-sm" href="#/tutorial">📘 Tutorial</a><a class="btn btn-sm" href="#/coleccion">Cambiar</a></div></div>
      ${shooter && keeper ? `<div class="lineup"><div class="slot"><h4>LANZADOR</h4>${cardHTML(shooter)}</div><div class="slot"><h4>PORTERO</h4>${cardHTML(keeper)}</div></div>`
        : `<div class="banner warn">Todavía no tienes titulares. <a href="#/tienda">Abre tu primer sobre</a>: cada sobre trae un lanzador y un portero.</div>`}
    </div></div>`;
  if (!me.tutorialSeen) showTutorial(true);
};

// ---------------------------------------------------------------------
//  Perfil
// ---------------------------------------------------------------------
routes.perfil = () => {
  const me = state.me;
  const total = me.wins + me.losses;
  const owned = state.collection.length;
  const shooter = state.cards.get(me.shooterCard);
  const keeper = state.cards.get(me.keeperCard);
  app.innerHTML = `<div class="fade-in grid">
    <div class="panel">${profileHero(me)}</div>
    <div class="panel"><div class="statgrid">
      <div class="stat"><b>${total}</b><span>Partidos</span></div>
      <div class="stat"><b>${total ? Math.round((me.wins / total) * 100) : 0}%</b><span>Victorias</span></div>
      <div class="stat"><b>${me.streak}</b><span>Racha actual</span></div>
      <div class="stat"><b>${me.bestStreak}</b><span>Mejor racha</span></div>
      <div class="stat"><b>${owned}</b><span>Cartas distintas</span></div>
      <div class="stat"><b>${me.coins.toLocaleString('es-ES')}</b><span>Monedas</span></div>
    </div><div style="margin-top:14px">${streakHTML(me.streak)}</div></div>
    <div class="grid grid-2">
      <div class="panel"><h2>Titulares</h2>${shooter && keeper ? `<div class="lineup"><div class="slot"><h4>LANZADOR</h4>${cardHTML(shooter)}</div><div class="slot"><h4>PORTERO</h4>${cardHTML(keeper)}</div></div>` : '<p class="muted">Sin titulares todavía.</p>'}</div>
      <div class="panel"><h2>Últimos partidos</h2><ul class="history" id="hist"><li class="muted">Cargando…</li></ul></div>
    </div>
    <div class="row"><button class="btn" id="tut">📘 Ver tutorial</button><div class="spacer"></div><button class="btn btn-danger" id="logout">Cerrar sesión</button></div>
  </div>`;
  $$('.lineup .fcard').forEach((c) => c.style.setProperty('--w', '140px'));
  $('#tut').onclick = () => showTutorial(false);
  $('#logout').onclick = async () => { await api('POST', '/api/logout', {}).catch(() => {}); onLoggedOut(); toast('Sesión cerrada. Tus datos quedan guardados.'); };
  api('GET', '/api/matches').then(({ matches }) => {
    const h = $('#hist'); if (!h) return;
    h.innerHTML = matches.map((m) => {
      const home = m.home_id === me.id;
      const won = m.winner_id === me.id;
      const opp = home ? m.away_name : m.home_name;
      const score = home ? `${m.home_goals}-${m.away_goals}` : `${m.away_goals}-${m.home_goals}`;
      return `<li><span class="tag ${won ? 'win' : 'loss'}">${won ? 'VICTORIA' : 'DERROTA'}</span><span>vs <b>${esc(opp)}</b></span><span class="spacer"></span>
        <b style="font-family:var(--display);font-size:1.4rem">${score}</b><span class="muted">${new Date(m.finished_at).toLocaleDateString('es-ES')}</span></li>`;
    }).join('') || '<li class="muted">Aún no has jugado ninguna tanda.</li>';
  }).catch(() => {});
};

// ---------------------------------------------------------------------
//  Colección
// ---------------------------------------------------------------------
routes.coleccion = () => {
  const f = { type: 'todos', tier: 'todas', q: '', sort: 'media', dup: false, missing: false };
  try { Object.assign(f, JSON.parse(sessionStorage.getItem('ps-filters') || '{}')); } catch { /* nada */ }
  app.innerHTML = `<div class="fade-in">
    <div class="screen-title"><div><h1>Colección</h1><p class="muted" id="col-sum"></p></div>
      <div class="row"><a class="btn btn-sm" href="#/creditos">📷 Créditos de fotos</a>
      <button class="btn btn-gold btn-sm" id="sell-all">💰 Vender todas las repetidas</button></div></div>
    <div class="panel" style="margin-bottom:16px"><div class="filters">
      <select id="f-type"><option value="todos">Todos</option><option value="jugador">Lanzadores</option><option value="portero">Porteros</option></select>
      <select id="f-tier"><option value="todas">Todas las categorías</option>${TIER_ORDER.map((t) => `<option value="${t}">${TIER_NAMES[t]}</option>`).join('')}</select>
      <select id="f-sort"><option value="media">Ordenar por media</option><option value="nombre">Por nombre</option><option value="recientes">Más recientes</option></select>
      <input id="f-q" placeholder="Buscar jugador…">
      <label class="check"><input type="checkbox" id="f-dup"> Solo repetidas</label>
      <label class="check"><input type="checkbox" id="f-missing"> Ver no conseguidas</label>
    </div></div>
    <div class="card-grid" id="grid"></div></div>`;
  $('#f-type').value = f.type; $('#f-tier').value = f.tier; $('#f-sort').value = f.sort; $('#f-q').value = f.q;
  $('#f-dup').checked = f.dup; $('#f-missing').checked = f.missing;

  function draw() {
    try { sessionStorage.setItem('ps-filters', JSON.stringify(f)); } catch { /* nada */ }
    const owned = new Map(state.collection.map((c) => [c.cardId, c]));
    const dups = state.collection.reduce((s, c) => s + c.count - 1, 0);
    $('#col-sum').textContent = `${owned.size} de ${state.cards.size} cartas · ${dups} repetida${dups === 1 ? '' : 's'}`;
    $('#sell-all').disabled = !dups;
    let list = [...state.cards.values()].filter((c) => f.missing || owned.has(c.id));
    if (f.type !== 'todos') list = list.filter((c) => c.type === f.type);
    if (f.tier !== 'todas') list = list.filter((c) => c.tier === f.tier);
    if (f.q) { const q = f.q.toLowerCase(); list = list.filter((c) => c.name.toLowerCase().includes(q) || c.nation.toLowerCase().includes(q)); }
    if (f.dup) list = list.filter((c) => (owned.get(c.id)?.count || 0) > 1);
    list.sort(f.sort === 'nombre' ? (a, b) => a.name.localeCompare(b.name, 'es')
      : f.sort === 'recientes' ? (a, b) => String(owned.get(b.id)?.first || '').localeCompare(String(owned.get(a.id)?.first || ''))
        : (a, b) => b.rating - a.rating || a.name.localeCompare(b.name, 'es'));
    const me = state.me;
    $('#grid').innerHTML = list.map((c) => cardHTML(c, {
      count: owned.get(c.id)?.count, tradable: owned.get(c.id)?.tradable || 0, missing: !owned.has(c.id), extraClass: owned.has(c.id) ? 'clickable' : '',
      selected: c.id === me.shooterCard || c.id === me.keeperCard,
    })).join('') || `<div class="panel center" style="grid-column:1/-1"><p>No hay cartas con estos filtros.</p>${state.collection.length ? '' : '<a class="btn btn-gold" href="#/tienda">Ir a la tienda</a>'}</div>`;
  }
  const bind = (id, key, prop = 'value') => $(id).addEventListener('input', (e) => { f[key] = e.target[prop]; draw(); });
  bind('#f-type', 'type'); bind('#f-tier', 'tier'); bind('#f-sort', 'sort'); bind('#f-q', 'q');
  bind('#f-dup', 'dup', 'checked'); bind('#f-missing', 'missing', 'checked');
  $('#grid').addEventListener('click', (e) => {
    const el = e.target.closest('.fcard.clickable'); if (el) cardDetail(el.dataset.card, draw);
  });
  $('#sell-all').onclick = async () => {
    const owned = state.collection.filter((c) => c.count > 1);
    const total = owned.reduce((s, c) => s + (c.count - 1) * state.meta.economy.quickSell[state.cards.get(c.cardId).tier], 0);
    const ok = await confirmModal('Vender repetidas', `Venderás todas las copias sobrantes (te quedas una de cada) por <b>${total} 🪙</b>.`, { okText: 'Vender' });
    if (!ok) return;
    try {
      const r = await api('POST', '/api/collection/sell-duplicates', {});
      setCoins(r.coins); sfx.coins(); toast(`Has vendido ${r.count} carta${r.count === 1 ? '' : 's'} por ${r.sold} monedas`, 'gold');
      await refreshMe(); draw();
    } catch (err) { toast(err.message, 'err'); }
  };
  draw();
};

function cardDetail(cardId, redraw) {
  const c = state.cards.get(cardId);
  const own = state.collection.find((x) => x.cardId === cardId);
  const me = state.me;
  const isStarter = c.id === me.shooterCard || c.id === me.keeperCard;
  const sell = state.meta.economy.quickSell[c.tier];
  const m = modal(`<div class="row" style="align-items:flex-start;gap:20px">
      <div style="margin:0 auto">${cardHTML(c, { extraClass: 'shine' })}</div>
      <div style="flex:1;min-width:240px">
        <h2 style="margin-bottom:0">${esc(c.name)}</h2>
        <p class="muted" style="margin-top:4px">${c.type === 'portero' ? 'Portero' : 'Lanzador'} · ${esc(c.position)} · ${esc(c.nation)} · ${TIER_NAMES[c.tier]} · Media ${c.rating}</p>
        ${statBars(c)}
        <p class="muted" style="font-size:.85rem">${c.type === 'portero' ? 'La media de un portero representa su capacidad para parar penaltis.' : 'La media de un lanzador representa sobre todo lo bien que tira penaltis.'} Valoraciones orientativas de juego.</p>
        <p class="credit">${photoCredit(c)}</p>
        <p><b>Copias:</b> ${own?.count || 0}${own?.tradable ? ` · <b class="win">${own.tradable} transferible${own.tradable > 1 ? 's' : ''}</b>` : ''}</p>
        <div class="row">
          ${isStarter ? '<span class="chip">✔ Titular</span>' : `<button class="btn btn-primary" id="set-starter">${c.type === 'portero' ? '🧤 Poner como portero' : '⚽ Poner como lanzador'}</button>`}
          ${own?.count > 1 ? `<button class="btn btn-gold" id="sell-one">Venta rápida (+${sell} 🪙)</button>` : ''}
          ${own?.tradable ? (isStarter && own.count === 1 ? '<span class="muted" style="font-size:.85rem">💱 Para venderla en el mercado, pon antes otra carta de titular.</span>' : '<button class="btn btn-primary" id="to-market">💱 Vender en el mercado</button>') : ''}
        </div>
      </div></div>
    <div class="modal-actions"><button class="btn" data-close>Cerrar</button></div>`, { wide: true });
  $('.fcard', m.el).style.setProperty('--w', '220px');
  $('#set-starter', m.el)?.addEventListener('click', async () => {
    const body = { shooterCard: me.shooterCard, keeperCard: me.keeperCard };
    body[c.type === 'portero' ? 'keeperCard' : 'shooterCard'] = c.id;
    try {
      const r = await api('POST', '/api/lineup', body);
      applyMe(r); sfx.select(); toast(`${c.name} es ahora tu ${c.type === 'portero' ? 'portero' : 'lanzador'} titular`);
      m.close(); redraw?.();
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#to-market', m.el)?.addEventListener('click', () => { m.close(); listOnMarket(c, redraw); });
  $('#sell-one', m.el)?.addEventListener('click', async () => {
    try {
      const r = await api('POST', '/api/collection/sell', { cardId: c.id });
      setCoins(r.coins); sfx.coins(); toast(`Vendida por ${r.sold} monedas`, 'gold');
      await refreshMe(); m.close(); redraw?.();
    } catch (err) { toast(err.message, 'err'); }
  });
}

// ---------------------------------------------------------------------
//  Tienda
// ---------------------------------------------------------------------
routes.tienda = () => {
  const draw = () => {
    app.innerHTML = `<div class="fade-in">
      <div class="screen-title"><div><h1>Tienda de sobres</h1><p class="muted">Cada sobre trae <b>1 lanzador</b> y <b>1 portero</b> (el <b>Sobre Mega</b> trae 7 lanzadores de distintas posiciones y 3 porteros). Solo se paga con monedas del juego.</p></div>
        <span class="coins" style="font-size:1.2rem">🪙 ${state.me.coins.toLocaleString('es-ES')}</span></div>
      ${[[false, 'Sobres', ''], [true, '💱 Sobres transferibles', 'Mismas probabilidades al doble de precio. Sus cartas se pueden vender en el <a href="#/mercado">mercado de transferibles</a>.']].map(([tr, title, sub]) => `
      <h2 style="margin:18px 0 4px">${title}</h2>${sub ? `<p class="muted" style="margin:0 0 10px">${sub}</p>` : ''}
      <div class="packs">${state.meta.packs.filter((p) => !!p.tradable === tr).map((p) => `<div class="panel pack-card">
        <div class="pack-art p-${p.id.replace(/-t$/, '')} ${p.tradable ? 'tradable' : ''}"><span class="pk-ball">⚽</span><span class="pname">${esc(p.name.replace('Sobre ', '').replace(' transferible', '').toUpperCase())}</span>${p.tradable ? '<span class="pk-trade">⇄ TRANSFERIBLE</span>' : ''}</div>
        <h2 style="margin:0">${esc(p.name)}</h2>
        <div class="price">${p.price.toLocaleString('es-ES')} 🪙</div>
        <table class="odds"><tbody>${TIER_ORDER.filter((t) => p.odds[t] > 0).map((t) => `<tr><td><span class="tier-dot td-${t}"></span>${TIER_NAMES[t]}</td><td>${p.odds[t]}%</td></tr>`).join('')}</tbody></table>
        <p class="muted" style="font-size:.8rem;margin:0">${p.players ? `Trae <b>${p.players} lanzadores y ${p.keepers} porteros</b>, sin repetir. ` : ''}Probabilidad por carta (se aplica a cada carta por separado)</p>
        <button class="btn btn-gold btn-block" data-buy="${p.id}" ${state.me.coins < p.price ? 'disabled' : ''}>${state.me.coins < p.price ? 'Monedas insuficientes' : 'Comprar'}</button>
      </div>`).join('')}</div>`).join('')}
      <div class="panel" style="margin-top:16px"><h3>¿Cómo conseguir más monedas?</h3>
        <p class="muted" style="margin:0">Gana tandas: <b class="win">+${state.meta.economy.winReward}</b> por victoria y <b>+${state.meta.economy.lossReward}</b> por derrota (abandonar no da monedas). También puedes vender cartas repetidas en tu colección.</p></div>
    </div>`;
    $$('[data-buy]').forEach((b) => (b.onclick = () => buy(state.meta.packs.find((p) => p.id === b.dataset.buy))));
  };
  async function buy(pack, skipConfirm = false) {
    if (!skipConfirm) {
      const ok = await confirmModal(`Comprar ${pack.name}`, `¿Quieres gastar <b>${pack.price} 🪙</b>? Te quedarán ${(state.me.coins - pack.price).toLocaleString('es-ES')}.`, { okText: 'Comprar y abrir' });
      if (!ok) return;
    }
    try {
      const r = await api('POST', '/api/shop/open', { packId: pack.id });
      setCoins(r.coins);
      refreshMe();
      openPackAnimation({
        pack, cards: r.cards,
        onAgain: state.me.coins >= pack.price ? () => buy(pack, true) : null,
        onCollection: () => { location.hash = '#/coleccion'; },
        onClose: () => { if (currentRoute().name === 'tienda') draw(); },
      });
    } catch (err) { toast(err.message, 'err'); sfx.alarm(); }
  }
  draw();
};

function pickLevelsText() {
  const l = state.meta.pick.levels || [];
  return l.map((x, i) => `${x.wins} victorias seguidas: pick de media ${i === l.length - 1 ? `${x.min}+` : `hasta ${x.max}`}`).join(' · ')
    + (l.length ? ` (y cada ${l.at(-1).wins} más).` : '');
}

// ---------------------------------------------------------------------
//  Player picks
// ---------------------------------------------------------------------
routes.picks = () => {
  app.innerHTML = `<div class="fade-in"><div class="screen-title"><div><h1>Player picks</h1>
    <p class="muted">${pickLevelsText()} Elige 1 de 3 cartas. Perder rompe el progreso hacia el siguiente pick, pero los que ya has conseguido no caducan.</p></div></div>
    <div id="picks-body"><div class="spinner"></div></div></div>`;
  const load = async () => {
    const { picks, streak } = await api('GET', '/api/picks');
    const pending = picks.filter((p) => !p.claimedCard);
    const claimed = picks.filter((p) => p.claimedCard);
    state.pendingPicks = pending.length; renderHeader();
    const body = $('#picks-body'); if (!body) return;
    body.innerHTML = `
      <div class="panel" style="margin-bottom:16px"><h3>Progreso de la racha</h3>
        <p style="margin:0 0 8px">Racha actual: <b>${streak}</b> victoria${streak === 1 ? '' : 's'} seguida${streak === 1 ? '' : 's'}</p>${streakHTML(streak)}</div>
      ${pending.map((p) => `<div class="panel pick-block" data-pick="${p.id}">
        <h2>🎁 ${p.streakAt ? `Pick por racha de ${p.streakAt} victorias` : 'Player pick especial'}</h2><p class="muted">Elige una carta para añadirla a tu colección. Las opciones son fijas: recargar no las cambia.</p>
        <div class="pick-options">${p.options.map((id, i) => `<div class="pick-option flip-in" style="animation-delay:${i * 0.15}s" data-card="${id}">
          ${cardHTML(state.cards.get(id), { extraClass: 'shine' })}<button class="btn btn-primary btn-sm">Elegir</button></div>`).join('')}</div></div>`).join('')
        || '<div class="panel center"><p>No tienes player picks pendientes.</p><a class="btn btn-primary" href="#/sala">¡A ganar partidos!</a></div>'}
      ${claimed.length ? `<div class="panel"><h3>Picks reclamados</h3><ul class="history">${claimed.map((p) => {
        const c = state.cards.get(p.claimedCard);
        return `<li><span class="tier-dot td-${c?.tier}"></span><b>${esc(c?.name || p.claimedCard)}</b><span class="muted">${c ? `${TIER_NAMES[c.tier]} · ${c.rating}` : ''}</span><span class="spacer"></span><span class="muted">${new Date(p.claimedAt).toLocaleDateString('es-ES')}</span></li>`;
      }).join('')}</ul></div>` : ''}`;
    $$('.pick-option').forEach((opt) => opt.addEventListener('click', async () => {
      const pickId = Number(opt.closest('[data-pick]').dataset.pick);
      const card = state.cards.get(opt.dataset.card);
      $$('.pick-option', opt.parentElement).forEach((o) => o.classList.toggle('chosen', o === opt));
      sfx.select();
      const ok = await confirmModal('Confirmar player pick', `¿Te quedas con <b>${esc(card.name)}</b> (${TIER_NAMES[card.tier]}, media ${card.rating})? Las otras dos opciones se descartan.`, { okText: 'Elegir esta carta' });
      if (!ok) return;
      try {
        const r = await api('POST', `/api/picks/${pickId}/claim`, { cardId: card.id });
        await refreshMe();
        openPackAnimation({ cards: [{ ...r.card, isNew: true }], title: 'Player pick', onClose: () => load() });
      } catch (err) { toast(err.message, 'err'); load(); }
    }));
  };
  load().catch((e) => toast(e.message, 'err'));
};

// ---------------------------------------------------------------------
//  Mercado de transferibles
// ---------------------------------------------------------------------
const fmt = (n) => Number(n || 0).toLocaleString('es-ES');
const fmtLeft = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  if (s >= 60) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${s} s`;
};
const DURATIONS = { 5: '5 minutos', 60: '1 hora', 180: '3 horas', 720: '12 horas', 1440: '24 horas' };

function listOnMarket(c, redraw) {
  const mk = state.meta.market;
  const suggested = { bronce: 300, plata: 1000, oro: 4000, elite: 25000, toty: 150000, futties: 150000, icono: 600000, goat: 5000000 }[c.tier] || 1000;
  const m = modal(`<h2>💱 Vender ${esc(c.name)}</h2>
    <div class="row" style="align-items:flex-start;gap:18px"><div>${cardHTML(c)}</div>
    <form class="grid" id="mk-form" style="flex:1;min-width:220px">
      <label>Precio de salida (puja mínima)</label><input name="startPrice" type="number" min="${mk.minPrice}" step="50" value="${suggested}" required>
      <label>Precio "comprar ya"</label><input name="buyNow" type="number" min="${mk.minPrice}" step="50" value="${suggested * 3}" required>
      <label>Duración</label><select name="minutes">${mk.durationsMin.map((d) => `<option value="${d}" ${d === 60 ? 'selected' : ''}>${DURATIONS[d] || `${d} min`}</option>`).join('')}</select>
      <p class="muted" style="margin:0;font-size:.85rem">Al vender pagas un impuesto del ${Math.round(mk.taxPct * 100)}%. Si nadie la compra, la carta vuelve a tu colección. Puedes retirarla mientras no tenga pujas.</p>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-gold">Poner a la venta</button></div>
    </form></div>`, { wide: true });
  $('.fcard', m.el).style.setProperty('--w', '160px');
  $('#mk-form', m.el).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('POST', '/api/market/list', { cardId: c.id, startPrice: Number(fd.get('startPrice')), buyNow: Number(fd.get('buyNow')), minutes: Number(fd.get('minutes')) });
      m.close(); sfx.coins(); toast(`${c.name} está a la venta en el mercado`, 'gold');
      await refreshMe(); redraw?.();
    } catch (err) { toast(err.message, 'err'); }
  };
}

routes.mercado = () => {
  let tab = 'comprar';
  const f = { q: '', tier: '', type: '' };
  app.innerHTML = `<div class="fade-in">
    <div class="screen-title"><div><h1>💱 Mercado de transferibles</h1>
      <p class="muted">Puja o compra al momento cartas de otros jugadores. Para vender, abre una carta transferible (⇄) en tu <a href="#/coleccion">colección</a>.</p></div>
      <span class="coins" style="font-size:1.2rem" id="mk-coins">🪙 ${fmt(state.me.coins)}</span></div>
    <div class="row tabs" style="margin-bottom:12px">
      <button class="btn btn-sm" data-tab="comprar">🔎 Comprar</button>
      <button class="btn btn-sm" data-tab="ventas">📤 Mis ventas</button>
      <button class="btn btn-sm" data-tab="pujas">🔨 Mis pujas</button>
    </div>
    <div class="panel" id="mk-filters" style="margin-bottom:12px"><div class="filters">
      <input id="mk-q" placeholder="Buscar jugador…">
      <select id="mk-tier"><option value="">Todas las categorías</option>${TIER_ORDER.map((t) => `<option value="${t}">${TIER_NAMES[t]}</option>`).join('')}</select>
      <select id="mk-type"><option value="">Todos</option><option value="jugador">Lanzadores</option><option value="portero">Porteros</option></select>
    </div></div>
    <div id="mk-body"><div class="spinner"></div></div></div>`;

  const item = (l, actions) => {
    const c = state.cards.get(l.cardId);
    if (!c) return '';
    const price = l.bid != null ? `<b>${fmt(l.bid)} 🪙</b> <span class="muted">(${l.bids} puja${l.bids === 1 ? '' : 's'})</span>` : `<span class="muted">Salida:</span> <b>${fmt(l.startPrice)} 🪙</b>`;
    const status = l.status === 'active' ? `⏱ <span data-left="${Date.now() + l.leftMs}">${fmtLeft(l.leftMs)}</span>`
      : { sold: '✅ Vendida', expired: '⌛ Sin ofertas', cancelled: '↩ Retirada' }[l.status] || l.status;
    return `<div class="panel mk-item" data-id="${l.id}">
      ${cardHTML(c)}
      <div class="mk-info">
        ${l.sellerName && !l.mine ? `<div class="muted" style="font-size:.85rem">Vende: <b>${esc(l.sellerName)}</b></div>` : ''}
        <div>${price}${l.youAreBidder && l.status === 'active' ? ' <span class="tag win">TU PUJA</span>' : ''}</div>
        <div><span class="muted">Comprar ya:</span> <b>${fmt(l.buyNow)} 🪙</b></div>
        <div class="muted">${status}</div>
        ${actions(l)}
      </div></div>`;
  };
  const buyActions = (l) => l.status !== 'active' ? '' : `<div class="row" style="gap:6px;margin-top:6px">
      <input type="number" class="mk-bid" min="${l.minBid}" step="50" value="${l.minBid}" style="width:110px" ${l.youAreBidder ? 'disabled' : ''}>
      <button class="btn btn-sm" data-bid="${l.id}" ${l.youAreBidder ? 'disabled' : ''}>🔨 Pujar</button>
      <button class="btn btn-sm btn-gold" data-buy="${l.id}">Comprar ya</button></div>`;

  async function load() {
    const body = $('#mk-body'); if (!body) return;
    $$('[data-tab]').forEach((b) => b.classList.toggle('btn-primary', b.dataset.tab === tab));
    $('#mk-filters').hidden = tab !== 'comprar';
    $('#mk-coins').textContent = `🪙 ${fmt(state.me.coins)}`;
    if (tab === 'comprar') {
      const qs = new URLSearchParams(f).toString();
      const { listings } = await api('GET', `/api/market?${qs}`);
      body.innerHTML = `<div class="mk-grid">${listings.map((l) => item(l, buyActions)).join('')}</div>`
        || '';
      if (!listings.length) body.innerHTML = '<div class="panel center"><p>No hay cartas a la venta con estos filtros.</p></div>';
    } else {
      const { selling, bidding, won } = await api('GET', '/api/market/mine');
      if (tab === 'ventas') {
        body.innerHTML = selling.length ? `<div class="mk-grid">${selling.map((l) => item(l, (x) => x.status === 'active' && !x.bid
          ? `<button class="btn btn-sm" data-cancel="${x.id}" style="margin-top:6px">↩ Retirar</button>` : '')).join('')}</div>`
          : '<div class="panel center"><p>No tienes cartas a la venta. Abre una carta transferible (⇄) en tu colección y pulsa "Vender en el mercado".</p><a class="btn btn-gold" href="#/coleccion">Ir a la colección</a></div>';
      } else {
        body.innerHTML = `<h3>Pujas activas</h3>${bidding.length ? `<div class="mk-grid">${bidding.map((l) => item(l, buyActions)).join('')}</div>` : '<p class="muted">No tienes pujas activas.</p>'}
          <h3>Ganadas / compradas (últimos 3 días)</h3>${won.length ? `<div class="mk-grid">${won.map((l) => item(l, () => '')).join('')}</div>` : '<p class="muted">Todavía nada.</p>'}`;
      }
    }
    $$('#mk-body .fcard').forEach((c) => c.style.setProperty('--w', '120px'));
  }

  $$('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; load().catch((e) => toast(e.message, 'err')); }));
  let qT = 0;
  $('#mk-q').addEventListener('input', (e) => { f.q = e.target.value; clearTimeout(qT); qT = setTimeout(() => load().catch(() => {}), 300); });
  $('#mk-tier').addEventListener('input', (e) => { f.tier = e.target.value; load().catch(() => {}); });
  $('#mk-type').addEventListener('input', (e) => { f.type = e.target.value; load().catch(() => {}); });
  $('#mk-body').addEventListener('click', async (e) => {
    const bid = e.target.closest('[data-bid]'), buy = e.target.closest('[data-buy]'), cancel = e.target.closest('[data-cancel]');
    try {
      if (bid) {
        const amount = Number(bid.parentElement.querySelector('.mk-bid').value);
        const r = await api('POST', `/api/market/${bid.dataset.bid}/bid`, { amount });
        if (r.card) toast(`¡Has comprado ${r.card.name}!`, 'gold'); else toast(`Puja de ${fmt(amount)} 🪙 hecha`);
        sfx.coins(); await refreshMe(); load();
      }
      if (buy) {
        const l = buy.closest('.mk-item');
        const ok = await confirmModal('Comprar ya', `¿Comprar esta carta por <b>${$('.mk-info div:nth-child(3) b', l)?.textContent || ''}</b>?`, { okText: 'Comprar' });
        if (!ok) return;
        const r = await api('POST', `/api/market/${buy.dataset.buy}/buy`);
        await refreshMe();
        openPackAnimation({ cards: [{ ...r.card, isNew: true }], title: 'Mercado', onClose: () => load() });
      }
      if (cancel) {
        await api('POST', `/api/market/${cancel.dataset.cancel}/cancel`);
        toast('Carta retirada: vuelve a tu colección'); await refreshMe(); load();
      }
    } catch (err) { toast(err.message, 'err'); load().catch(() => {}); }
  });
  const offMk = bus.on('market', () => load().catch(() => {}));
  const iv = setInterval(() => {
    $$('[data-left]').forEach((s) => { s.textContent = fmtLeft(Number(s.dataset.left) - Date.now()); });
  }, 1000);
  const refresh = setInterval(() => load().catch(() => {}), 20_000);
  load().catch((e) => toast(e.message, 'err'));
  return () => { clearInterval(iv); clearInterval(refresh); offMk(); };
};

// ---------------------------------------------------------------------
//  Sala / partido
// ---------------------------------------------------------------------
routes.sala = (params) => renderSala(app, {
  state, bus, params, emit, refreshMe,
  clearRoom() { state.room = null; bus.emit('room'); },
});

// ---------------------------------------------------------------------
//  Clasificación
// ---------------------------------------------------------------------
routes.clasificacion = () => {
  let type = 'victorias';
  app.innerHTML = `<div class="fade-in"><div class="screen-title"><div><h1>Clasificación</h1>
    <p class="muted">Desempate: en victorias gana quien tiene menos derrotas; en derrotas, quien tiene menos victorias. Si sigue el empate, la cuenta más antigua.</p></div>
    <div class="tabs"><button data-t="victorias" class="active">🏆 Más victorias</button><button data-t="derrotas">💀 Más derrotas</button></div></div>
    <div class="panel table-wrap" id="lb"><div class="spinner"></div></div></div>`;
  const load = async () => {
    const { rows } = await api('GET', `/api/leaderboard?type=${type}`);
    const lb = $('#lb'); if (!lb) return;
    lb.innerHTML = `<table class="table"><thead><tr><th>#</th><th>Equipo</th><th>Victorias</th><th>Derrotas</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.id === state.me.id ? 'me' : ''}"><td class="num pos-${r.pos}">${r.pos}</td>
        <td><div class="who">${crestSVG(state.crestById(r.crest))}${esc(r.username)}</div></td>
        <td class="num win">${r.wins}</td><td class="num loss">${r.losses}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Todavía no hay jugadores.</td></tr>'}
      </tbody></table>`;
  };
  $$('.tabs button').forEach((b) => (b.onclick = () => {
    type = b.dataset.t; $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b)); load();
  }));
  load().catch((e) => toast(e.message, 'err'));
};

// ---------------------------------------------------------------------
//  Administración
// ---------------------------------------------------------------------
// Campos del formulario de regalo: monedas y una carta opcional.
function giftFields() {
  const cards = [...state.cards.values()]
    .sort((a, b) => TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier) || b.rating - a.rating || a.name.localeCompare(b.name));
  return `<input name="coins" type="number" min="0" step="1" placeholder="Monedas" style="width:140px">
    <select name="cardId" style="width:auto;max-width:320px"><option value="">— Sin carta —</option>
    ${cards.map((c) => `<option value="${esc(c.id)}">${esc(TIER_NAMES[c.tier])} · ${c.rating} · ${esc(c.name)} (${c.type === 'portero' ? 'POR' : esc(c.position)})</option>`).join('')}</select>
    <label class="row" style="gap:6px;margin:0;white-space:nowrap"><input type="checkbox" name="pick" style="width:auto"> Player pick</label>`;
}
function giftBody(form) {
  const fd = new FormData(form);
  return { coins: fd.get('coins') ? Number(fd.get('coins')) : 0, cardId: fd.get('cardId') || null, pick: fd.get('pick') === 'on' };
}

routes.admin = () => {
  app.innerHTML = `<div class="fade-in grid">
    <div class="screen-title"><div><h1>🛡️ Administración</h1><p class="muted" id="adm-sum"></p></div><button class="btn btn-sm" id="adm-refresh">↻ Actualizar</button></div>
    <div class="panel"><h3>Monedas de tu cuenta</h3>
      <form class="row" id="coins-form"><select name="mode" style="width:auto"><option value="add">Añadir / restar</option><option value="set">Fijar saldo</option></select>
      <input name="amount" type="number" step="1" required placeholder="Cantidad" style="width:160px"><button class="btn btn-gold">Aplicar</button>
      <span class="muted">Saldo actual: <b id="adm-coins">${state.me.coins}</b></span></form></div>
    <div class="panel"><h3>🎴 Player picks</h3>
      <div class="row"><button class="btn btn-gold" id="adm-pick">Abrir un player pick</button>
      <span class="muted">Se crea un pick nuevo para ti y vas directo a elegir la carta.</span></div></div>
    <div class="panel"><h3>🎁 Regalar a todos los conectados</h3>
      <form class="row" id="gift-all-form">${giftFields()}<button class="btn btn-gold">Regalar a todos</button></form></div>
    <div class="panel table-wrap"><h3>Cuentas registradas</h3><div id="adm-users"><div class="spinner"></div></div></div>
    <div class="panel table-wrap"><h3>Registro de operaciones</h3><div id="adm-logs"></div></div></div>`;
  const load = async () => {
    const [{ users }, { logs }] = await Promise.all([api('GET', '/api/admin/users'), api('GET', '/api/admin/logs')]);
    if (!$('#adm-users')) return;
    $('#adm-sum').textContent = `${users.length} cuentas · ${users.filter((u) => u.online).length} conectadas ahora · ${users.filter((u) => u.banned).length} baneadas`;
    $('#adm-users').innerHTML = `<table class="table"><thead><tr><th></th><th>Usuario</th><th>Rol</th><th>V</th><th>D</th><th>Racha</th><th>Monedas</th><th>Alta</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      ${users.map((u) => `<tr><td><span class="online-dot ${u.online ? 'on' : ''}" title="${u.online ? 'Conectado' : 'Desconectado'}"></span></td>
        <td><div class="who">${crestSVG(state.crestById(u.crest))}${esc(u.username)}</div></td><td>${u.role === 'admin' ? '🛡️ admin' : 'usuario'}</td>
        <td class="win"><b>${u.wins}</b></td><td class="loss"><b>${u.losses}</b></td><td>${u.streak}</td><td>${u.coins}</td>
        <td class="muted">${new Date(u.created_at).toLocaleDateString('es-ES')}</td>
        <td>${u.banned ? '<span class="tag loss">BANEADO</span>' : u.online ? '<span class="tag win">EN LÍNEA</span>' : '<span class="muted">—</span>'}</td>
        <td>${u.id === state.me.id ? '<span class="muted">(tú)</span>' : `<div class="row" style="flex-wrap:nowrap">
          ${u.banned ? '' : `<button class="btn btn-sm btn-gold" data-gift="${u.id}" data-name="${esc(u.username)}">🎁 Regalar</button>`}
          <button class="btn btn-sm" data-ban="${u.id}" data-v="${u.banned ? '0' : '1'}">${u.banned ? 'Desbanear' : 'Banear'}</button>
          <button class="btn btn-sm btn-danger" data-del="${u.id}" data-name="${esc(u.username)}">Borrar</button></div>`}</td></tr>`).join('')}
      </tbody></table>`;
    $('#adm-logs').innerHTML = `<table class="table"><thead><tr><th>Fecha</th><th>Admin</th><th>Acción</th><th>Objetivo</th><th>Detalles</th></tr></thead><tbody>
      ${logs.map((l) => `<tr><td class="muted">${new Date(l.created_at).toLocaleString('es-ES')}</td><td>${esc(l.admin_name)}</td><td><b>${esc(l.action)}</b></td><td>${esc(l.target || '')}</td><td class="muted">${esc(l.details || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin operaciones todavía.</td></tr>'}
      </tbody></table>`;
  };
  $('#adm-users').addEventListener('click', async (e) => {
    const ban = e.target.closest('[data-ban]');
    const del = e.target.closest('[data-del]');
    const gift = e.target.closest('[data-gift]');
    try {
      if (gift) {
        const m = modal(`<h2>🎁 Regalar a ${esc(gift.dataset.name)}</h2>
          <form class="grid" id="gift-form">${giftFields()}
          <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn btn-gold">Regalar</button></div></form>`);
        $('#gift-form', m.el).onsubmit = async (ev) => {
          ev.preventDefault();
          try {
            await api('POST', `/api/admin/users/${gift.dataset.gift}/gift`, giftBody(ev.target));
            m.close(); toast(`Regalo enviado a ${gift.dataset.name}`); sfx.coins(); load();
          } catch (err) { toast(err.message, 'err'); }
        };
      }
      if (ban) {
        const banned = ban.dataset.v === '1';
        if (banned && !(await confirmModal('Banear cuenta', 'El usuario será desconectado y no podrá iniciar sesión hasta que lo desbanees.', { okText: 'Banear', danger: true }))) return;
        await api('POST', `/api/admin/users/${ban.dataset.ban}/ban`, { banned });
        toast(banned ? 'Cuenta baneada' : 'Cuenta desbaneada'); load();
      }
      if (del) {
        const name = del.dataset.name;
        const typed = await confirmModal('Borrar cuenta', `Esta acción es <b>permanente</b>: se borrarán la cuenta, su colección y sus picks. Escribe <b>${esc(name)}</b> para confirmar.`, { okText: 'Borrar definitivamente', danger: true, input: name });
        if (typed == null) return;
        if (typed !== name) { toast('El nombre no coincide. No se ha borrado nada.', 'err'); return; }
        await api('DELETE', `/api/admin/users/${del.dataset.del}`, { confirm: typed });
        toast('Cuenta borrada'); load();
      }
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#coins-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('POST', '/api/admin/coins', { mode: fd.get('mode'), amount: Number(fd.get('amount')) });
      setCoins(r.coins); $('#adm-coins').textContent = r.coins; sfx.coins(); toast('Saldo actualizado'); load();
    } catch (err) { toast(err.message, 'err'); }
  };
  $('#adm-pick').onclick = async () => {
    try { await api('POST', '/api/admin/picks'); sfx.sparkle(); location.hash = '#/picks'; } catch (err) { toast(err.message, 'err'); }
  };
  $('#gift-all-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/admin/gift-online', giftBody(e.target));
      toast(`Regalo enviado a ${r.count} jugador${r.count === 1 ? '' : 'es'} conectado${r.count === 1 ? '' : 's'}`); sfx.coins();
      e.target.reset(); load();
    } catch (err) { toast(err.message, 'err'); }
  };
  $('#adm-refresh').onclick = () => load();
  load().catch((e) => toast(e.message, 'err'));
  const iv = setInterval(() => load().catch(() => {}), 10_000);
  return () => clearInterval(iv);
};

// ---------------------------------------------------------------------
//  Tutorial
// ---------------------------------------------------------------------
function tutorialHTML() {
  const s = state.meta.shot;
  return `<h2>📘 Cómo se juega</h2>
  <div class="tut-steps">
    <div class="tut-step"><div class="n">1</div><div><b>La tanda</b><p>Cinco penaltis por equipo, alternando. Si un equipo ya no puede alcanzar al otro, termina antes. Si hay empate tras los cinco, se sigue con <b>muerte súbita</b>.</p></div></div>
    <div class="tut-step"><div class="n">2</div><div><b>Lanzar</b><p>Cuando te toca lanzar verás seis círculos en la portería: arriba, a media altura y abajo, a izquierda y derecha (vistos desde el punto de penalti). Toca uno y chutas al momento. Tienes ${state.meta.match.chooseMs / 1000} segundos.</p></div></div>
    <div class="tut-step"><div class="n">3</div><div><b>Parar</b><p>Cuando defiendes, eliges dónde se tira tu portero. Toca una zona y tu portero se tirará ahí. Ninguno ve la decisión del otro hasta que ambos eligen o se acaba el tiempo (si no eliges, se elige al azar).</p></div></div>
    <div class="tut-step"><div class="n">4</div><div><b>Estadísticas</b><p><b>Lanzador:</b> precisión (menos tiros fuera), potencia (más difícil de parar y menos tiempo de reacción para el portero) y calidad de lanzamiento (colocación). <b>Portero:</b> reflejos y capacidad de parada (más probabilidad de detenerlo si acierta) y reincorporación (segunda estirada).</p>
      <div class="formula">Fuera = base por altura (arriba ${s.missBase[0] * 100}% · media ${s.missBase[1] * 100}% · abajo ${s.missBase[2] * 100}%) × (110 − precisión) / 50<br>
      Parada si aciertas la zona = ${s.save.base * 100}% + 0,8%·(parada−50) + 0,4%·(reflejos−50) − 0,6%·(potencia−50) − 0,4%·(calidad−50) ± altura (escuadras −12%, abajo +5%), entre ${s.save.min * 100}% y ${s.save.max * 100}%</div></div></div>
    <div class="tut-step"><div class="n">5</div><div><b>⚡ ¡Doble parada!</b><p>Si tu portero es <b>de oro o superior</b> y se tira al lado equivocado, hay un <b>${Math.round(s.second.chance * 100)}%</b> de probabilidad de que salga <b>¡DOBLE PARADA!</b>. Aparecen ${s.second.patternCircles} círculos numerados: tócalos en orden en ${s.second.minigameMs / 1000} segundos. Si lo consigues, tienes <b>${s.second.diveMs / 1000} segundo</b> para volver a tirarte a otro lado. Si aciertas, puedes pararlo (con un ${Math.round(s.second.saveFactor * 100)}% de la probabilidad normal).</p></div></div>
    <div class="tut-step"><div class="n">6</div><div><b>Premios</b><p>Victoria: +${state.meta.economy.winReward} 🪙 · Derrota: +${state.meta.economy.lossReward} 🪙 · Abandono: 0. ${pickLevelsText()} Si te desconectas más de 30 s durante un partido, pierdes por abandono.</p></div></div>
  </div>`;
}
function showTutorial(firstTime) {
  const m = modal(`${tutorialHTML()}<div class="modal-actions"><button class="btn btn-primary" data-close>${firstTime ? '¡Entendido, a jugar!' : 'Cerrar'}</button></div>`, {
    wide: true,
    onClose: () => {
      if (firstTime && state.me && !state.me.tutorialSeen) { state.me.tutorialSeen = true; api('POST', '/api/tutorial-seen', {}).catch(() => {}); }
    },
  });
  return m;
}
routes.creditos = () => {
  const list = [...new Map([...state.cards.values()].map((c) => [c.name, c])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  app.innerHTML = `<div class="fade-in panel"><h1>📷 Créditos de las fotos</h1>
    <p class="muted">Las fotos proceden de Wikimedia Commons y se usan según su licencia libre (Creative Commons o dominio público), citando autor y licencia.
    Las valoraciones de las cartas son orientativas de juego. Proyecto sin afiliación con clubes, ligas, EA SPORTS ni FIFA.</p>
    <ul class="history">${list.map((c) => `<li><b style="min-width:180px">${esc(c.name)}</b><span class="credit">${photoCredit(c)}</span></li>`).join('')}</ul></div>`;
};

routes.tutorial = () => {
  app.innerHTML = `<div class="fade-in panel" style="max-width:860px;margin:0 auto">${tutorialHTML()}
    <div class="modal-actions"><a class="btn btn-primary" href="#/sala">Jugar ahora</a></div></div>`;
};

// ---------------------------------------------------------------------
//  Arranque
// ---------------------------------------------------------------------
$('#mute-btn').onclick = () => { setMuted(!isMuted()); renderHeader(); if (!isMuted()) sfx.click(); };
document.addEventListener('click', (e) => { if (e.target.closest('.btn, .nav a')) sfx.click(); }, true);

(async function boot() {
  app.innerHTML = '<div class="spinner" style="margin-top:30vh"></div>';
  try {
    const [meta, { cards }, photos] = await Promise.all([api('GET', '/api/meta'), api('GET', '/api/cards'),
      fetch('/data/photos.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))]);
    setPhotos(photos);
    state.meta = meta;
    for (const c of cards) state.cards.set(c.id, c);
  } catch {
    app.innerHTML = '<div class="panel center"><h2>No se puede conectar con el servidor</h2><p class="muted">Inténtalo de nuevo en unos segundos.</p></div>';
    return;
  }
  try {
    applyMe(await api('GET', '/api/me'));
    connectSocket();
  } catch { /* sin sesión */ }
  route();
})();

export { STAT_NAMES };
