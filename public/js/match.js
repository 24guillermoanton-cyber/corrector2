// Sala privada y partido: sala de espera, cuenta atrás, portería interactiva, animaciones y resultados.
import { $, $$, esc, crestSVG, cardHTML, keeperFigure, shooterFigure, BALL_SVG, ZONE_NAMES, toast, modal, confirmModal, burst, sleep } from './ui.js';
import { sfx } from './sound.js';

// Geometría de la portería (en % del campo)
const GOAL = { left: 22, width: 56, top: 14, height: 40 };
const ZX = [20, 80], ZY = [19, 50, 81];
const zoneInGoal = (z) => ({ x: ZX[z % 2], y: ZY[Math.floor(z / 2)] });
const zoneOnPitch = (z) => {
  const g = zoneInGoal(z);
  return { x: GOAL.left + (GOAL.width * g.x) / 100, y: GOAL.top + (GOAL.height * g.y) / 100 };
};
const REASONS = {
  'tanda completada': 'Tanda completada', abandono: 'Abandono del rival', 'desconexión': 'Desconexión',
  inactividad: 'Inactividad', 'cuenta baneada': 'Cuenta suspendida', 'cuenta eliminada': 'Cuenta eliminada',
};

export function renderSala(app, ctx) {
  const { state, socket, bus, go } = ctx;
  let view = null;          // 'lobby' | 'waiting' | 'starting' | 'match'
  let cleanupView = null;
  let autoJoinTried = false;

  function render() {
    const st = state.room;
    const status = st?.status;
    const next = !st ? 'lobby' : status === 'waiting' ? 'waiting' : status === 'starting' ? 'starting' : 'match';
    if (next !== view) {
      cleanupView?.();
      view = next;
      cleanupView = ({ lobby: lobbyView, waiting: waitingView, starting: startingView, match: matchView })[next]();
    } else if (next === 'match') {
      matchCtl?.update(st);
    } else if (next === 'starting') {
      startingView.update?.();
    }
  }

  // ------------------------------------------------------------- Lobby
  function lobbyView() {
    const me = state.me;
    const shooter = state.cards.get(me.shooterCard);
    const keeper = state.cards.get(me.keeperCard);
    const hasLineup = shooter && keeper;
    app.innerHTML = `<div class="fade-in">
      <div class="screen-title"><div><h1>Jugar con un amigo</h1><p class="muted">Crea una sala privada y comparte el código o el enlace. Cada uno juega desde su dispositivo.</p></div>
      <a class="btn btn-sm" href="#/tutorial">📘 Cómo se juega</a></div>
      ${hasLineup ? '' : `<div class="banner warn">Necesitas un lanzador y un portero. <a href="#/tienda">Abre tu primer sobre en la tienda</a>.</div>`}
      <div class="grid grid-2">
        <div class="panel">
          <h2>Crear sala privada</h2>
          <p class="muted">Recibirás un código de 6 caracteres para tu amigo.</p>
          <button class="btn btn-primary btn-lg btn-block" id="create" ${hasLineup ? '' : 'disabled'}>⚽ Crear sala</button>
          <hr style="border-color:var(--line);margin:22px 0">
          <h2>Unirse con código</h2>
          <form id="join-form" class="row"><input id="join-code" maxlength="6" placeholder="Ej: K7P2QX" autocomplete="off" style="flex:1;text-transform:uppercase;letter-spacing:.2em;font-weight:800">
          <button class="btn btn-gold" ${hasLineup ? '' : 'disabled'}>Entrar</button></form>
          <p class="form-error" id="join-err"></p>
        </div>
        <div class="panel">
          <h2>Tu alineación</h2>
          <div class="lineup">
            <div class="slot"><h4>LANZADOR</h4>${shooter ? cardHTML(shooter, { extraClass: '' }) : '<p class="muted">Sin lanzador</p>'}</div>
            <div class="slot"><h4>PORTERO</h4>${keeper ? cardHTML(keeper) : '<p class="muted">Sin portero</p>'}</div>
          </div>
          <div class="center" style="margin-top:14px"><a class="btn btn-sm" href="#/coleccion">Cambiar titulares</a></div>
        </div>
      </div></div>`;
    $$('.lineup .fcard', app).forEach((c) => c.style.setProperty('--w', '140px'));
    const join = async (code) => {
      $('#join-err').textContent = '';
      const r = await ctx.emit('room:join', { code });
      if (!r.ok) { $('#join-err').textContent = r.error; sfx.alarm(); }
      else history.replaceState(null, '', '#/sala');
    };
    $('#create').onclick = async () => {
      sfx.click();
      const r = await ctx.emit('room:create');
      if (!r.ok) toast(r.error, 'err');
    };
    $('#join-form').onsubmit = (e) => { e.preventDefault(); join($('#join-code').value.trim().toUpperCase()); };
    const code = ctx.params[0];
    if (code && !autoJoinTried && hasLineup) { autoJoinTried = true; $('#join-code').value = code; join(code.toUpperCase()); }
    else if (code) $('#join-code').value = code;
    return null;
  }

  // ------------------------------------------------------------- Sala de espera
  function waitingView() {
    const st = state.room;
    const link = `${location.origin}/#/sala/${st.code}`;
    app.innerHTML = `<div class="fade-in" style="max-width:640px;margin:0 auto">
      <div class="panel center">
        <h2>Sala privada creada</h2>
        <p class="muted">Comparte este código con tu amigo:</p>
        <div class="room-code" id="room-code">${esc(st.code)}</div>
        <div class="row" style="justify-content:center">
          <button class="btn" id="copy-code">📋 Copiar código</button>
          <button class="btn" id="copy-link">🔗 Copiar enlace</button>
          ${navigator.share ? '<button class="btn" id="share">📤 Compartir</button>' : ''}
        </div>
        <div class="spinner" style="margin-top:26px"></div>
        <p><b>Esperando a tu rival<span class="waiting-dots"></span></b></p>
        <p class="muted">La sala caduca a los 15 minutos si nadie se une.</p>
        <button class="btn btn-ghost" id="cancel">Cancelar sala</button>
      </div></div>`;
    const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch { prompt('Copia esto:', t); } };
    $('#copy-code').onclick = () => copy(st.code, 'Código copiado');
    $('#copy-link').onclick = () => copy(link, 'Enlace copiado');
    $('#share') && ($('#share').onclick = () => navigator.share({ title: 'Penalti Stars', text: `¡Te reto a una tanda de penaltis! Código: ${st.code}`, url: link }).catch(() => {}));
    $('#cancel').onclick = () => ctx.emit('room:leave');
    return null;
  }

  // ------------------------------------------------------------- Cuenta atrás / VS
  function startingView() {
    const st = state.room;
    const [p0, p1] = st.players;
    const crest = (p) => state.crestById(p.crest);
    app.innerHTML = `<div class="fade-in panel" style="max-width:760px;margin:0 auto">
      <div class="vs-screen">
        <div>${crestSVG(crest(p0))}<h3>${esc(p0.name)}</h3>${cardHTML(p0.shooter)}</div>
        <div><div class="vs">VS</div><div class="countdown" id="cd">3</div></div>
        <div>${crestSVG(crest(p1))}<h3>${esc(p1.name)}</h3>${cardHTML(p1.shooter)}</div>
      </div>
      <p class="center muted">Lanza primero <b>${esc(p0.name)}</b>. Cinco penaltis por equipo, alternando.</p></div>`;
    $$('.vs-screen .fcard', app).forEach((c) => { c.style.setProperty('--w', '110px'); c.style.margin = '8px auto'; });
    sfx.whistle();
    const t0 = performance.now();
    const total = st.startsInMs ?? 3000;
    const iv = setInterval(() => {
      const left = Math.max(0, total - (performance.now() - t0));
      const n = Math.ceil(left / 1000);
      const cd = $('#cd');
      if (cd && cd.textContent !== String(n || '¡YA!')) { cd.textContent = n || '¡YA!'; cd.style.animation = 'none'; void cd.offsetWidth; cd.style.animation = ''; sfx.tick(); }
    }, 100);
    return () => clearInterval(iv);
  }

  // ------------------------------------------------------------- Partido
  let matchCtl = null;
  function matchView() {
    matchCtl = createMatch(app, ctx);
    matchCtl.update(state.room);
    return () => { matchCtl.destroy(); matchCtl = null; };
  }

  const offState = bus.on('room', render);
  const offKick = bus.on('kick', (r) => matchCtl?.onKick(r));
  const offEnd = bus.on('end', (r) => matchCtl?.onEnd(r));
  render();
  return () => { offState(); offKick(); offEnd(); cleanupView?.(); };
}

// =====================================================================
//  Controlador del partido
// =====================================================================
function createMatch(app, ctx) {
  const { state } = ctx;
  let st = null;
  let selected = null;
  let kickIndexShown = -1;      // índice del lanzamiento cuya escena está preparada
  let introFor = -1;            // índice con introducción de segunda estirada ya animada
  let animating = false;
  let animDoneAt = 0;
  let timerDeadline = 0, timerTotal = 1;
  let raf = 0;
  let destroyed = false;
  let endShown = false;
  let pendingEnd = null;

  app.innerHTML = `<div class="fade-in">
    <div id="m-banner"></div>
    <div class="match-wrap">
      <div>
        <div class="scoreboard" id="sb"></div>
        <div class="pitch" id="pitch">
          <div class="stands" id="stands"></div><div class="ads"><span>PENALTI STARS</span><span>⚽</span><span>FAIR PLAY</span></div>
          <div class="turf"></div><div class="box"></div><div class="spot-mark"></div>
          <div class="goal" id="goal"><div class="net" id="net"></div><div class="frame"></div>
            ${[0, 1, 2, 3, 4, 5].map((z) => `<button class="zone" data-z="${z}" style="left:${zoneInGoal(z).x}%;top:${zoneInGoal(z).y}%" aria-label="${ZONE_NAMES[z]}"></button>`).join('')}
          </div>
          <div class="keeper idle" id="keeper"></div>
          <div class="ball-shadow" id="shadow"></div>
          <div class="ball" id="ball">${BALL_SVG}</div>
          <div class="shooter" id="shooter"></div>
          <div class="match-msg" id="msg">Preparando…</div>
          <div class="big-text" id="big"></div>
          <div class="second-panel" id="second" hidden></div>
          <div class="timer"><i id="timer"></i></div>
        </div>
        <div class="match-controls" id="controls"></div>
      </div>
      <div class="side-col">
        <div class="panel"><h3>Alineaciones</h3><div id="lineups"></div></div>
        <div class="panel"><h3>Historial</h3><ul class="kick-log" id="log"></ul></div>
      </div>
    </div></div>`;

  const el = {
    sb: $('#sb'), pitch: $('#pitch'), keeper: $('#keeper'), ball: $('#ball'), shadow: $('#shadow'), shooter: $('#shooter'),
    msg: $('#msg'), big: $('#big'), second: $('#second'), timer: $('#timer'), controls: $('#controls'), log: $('#log'),
    banner: $('#m-banner'), net: $('#net'), stands: $('#stands'), lineups: $('#lineups'),
  };
  const zones = $$('.zone', app);

  zones.forEach((zb) => zb.addEventListener('click', () => onZone(Number(zb.dataset.z))));

  const crestOf = (side) => state.crestById(st.players[side].crest);
  const myRole = () => st.cur?.role;

  // ---------------- Escena ----------------
  function resetScene() {
    for (const n of [el.ball, el.keeper, el.shooter]) n.style.transition = 'none';
    el.ball.className = 'ball';
    el.ball.style.left = '50%'; el.ball.style.top = '86%'; el.ball.style.transform = 'translate(-50%, -50%) scale(1)';
    el.shadow.style.opacity = '1';
    el.keeper.className = 'keeper idle';
    el.keeper.style.left = '50%'; el.keeper.style.top = '54%'; el.keeper.style.transform = '';
    el.shooter.className = 'shooter';
    el.big.className = 'big-text'; el.big.innerHTML = '';
    el.second.hidden = true;
    void el.ball.offsetWidth;
    for (const n of [el.ball, el.keeper, el.shooter]) n.style.transition = '';
    if (st?.cur) {
      el.shooter.innerHTML = shooterFigure(crestOf(st.cur.side).c1);
      el.keeper.innerHTML = keeperFigure(crestOf(1 - st.cur.side).c2 === '#ffffff' ? '#ffcc00' : crestOf(1 - st.cur.side).c2);
    }
  }

  function keeperTo(z, { fast = false } = {}) {
    const p = zoneOnPitch(z);
    const col = z % 2 === 0 ? -1 : 1;
    const row = Math.floor(z / 2);
    el.keeper.classList.remove('idle');
    el.keeper.style.transition = fast ? 'left .22s ease-out, top .22s ease-out, transform .22s ease-out' : '';
    el.keeper.style.left = `${p.x - col * 3}%`;
    el.keeper.style.top = `${row === 2 ? 56 : p.y + 13}%`;
    el.keeper.style.transform = `translate(-50%, -100%) rotate(${col * [40, 68, 86][row]}deg)`;
  }
  function keeperRecover() {
    el.keeper.style.transition = 'left .2s ease-out, top .2s ease-out, transform .2s ease-out';
    el.keeper.style.left = '50%'; el.keeper.style.top = '54%'; el.keeper.style.transform = 'translate(-50%, -100%) rotate(0deg)';
  }
  function ballTo(x, y, scale = 0.55, cls = 'fly') {
    el.ball.className = `ball ${cls} spin`;
    el.ball.style.left = `${x}%`; el.ball.style.top = `${y}%`;
    el.ball.style.transform = `translate(-50%, -50%) scale(${scale})`;
    el.shadow.style.opacity = '0';
  }
  function ballTarget(kick) {
    const p = zoneOnPitch(kick.zone);
    if (kick.outcome !== 'fuera') return p;
    const row = Math.floor(kick.zone / 2);
    if (row === 0) return { x: p.x + (kick.zone % 2 ? 4 : -4), y: GOAL.top - 7 };
    return { x: kick.zone % 2 ? GOAL.left + GOAL.width + 7 : GOAL.left - 7, y: p.y };
  }
  function bigText(kind) {
    const txt = { gol: '¡GOOOL!', parada: '¡PARADA!', fuera: '¡FUERA!' }[kind];
    el.big.className = `big-text ${kind}`;
    el.big.innerHTML = `<span>${txt}</span>`;
  }

  async function playOutcome(kick, fromHang = false) {
    const t = ballTarget(kick);
    ballTo(t.x, t.y, kick.outcome === 'fuera' ? 0.5 : 0.55, 'fly');
    await sleep(fromHang ? 380 : 460);
    if (destroyed) return;
    const iShot = kick.side === st.you;
    if (kick.outcome === 'gol') {
      el.net.classList.remove('shake'); void el.net.offsetWidth; el.net.classList.add('shake');
      el.ball.classList.remove('spin');
      bigText('gol'); sfx.goal();
      el.stands.classList.remove('cheer'); void el.stands.offsetWidth; el.stands.classList.add('cheer');
      el.shooter.classList.add('celebrate');
      if (iShot) burst(el.pitch, { count: 50, colors: ['#ffd54a', '#27e36f', '#fff', crestOf(kick.side).c1], spread: 300, x: `${t.x}%`, y: `${t.y}%` });
    } else if (kick.outcome === 'parada') {
      const dx = kick.zone % 2 ? -14 : 14;
      ballTo(t.x + dx, Math.min(80, t.y + 30), 0.75, 'fly');
      bigText('parada'); sfx.save();
      if (!iShot) burst(el.pitch, { count: 40, colors: ['#2f7bff', '#9cc6ff', '#fff'], spread: 260, x: `${t.x}%`, y: `${t.y}%` });
    } else {
      ballTo(t.x + (t.x < 50 ? -6 : 6), t.y - 6, 0.4, 'fly');
      bigText('fuera'); sfx.miss();
    }
  }

  async function onKick({ kick, index }) {
    // Lanzamiento resuelto en el servidor: animamos lo que ha pasado.
    animating = true;
    animDoneAt = Date.now() + 1700;
    revealAt = Date.now() + (introFor === index ? 650 : 1000);
    disableZones(true);
    el.second.hidden = true;
    stopTimer();
    if (introFor === index) {
      // Venía de la ventana de segunda estirada
      if (kick.dive2 != null) {
        keeperRecover(); sfx.dive();
        await sleep(200);
        keeperTo(kick.dive2, { fast: true });
      }
      await playOutcome(kick, true);
    } else {
      if (kickIndexShown !== index) { resetScene(); kickIndexShown = index; }
      el.msg.textContent = `${st.players[kick.side].name} chuta…`;
      el.shooter.classList.add('run');
      await sleep(450);
      if (destroyed) return;
      sfx.kick();
      const t = ballTarget(kick);
      ballTo(t.x, t.y, 0.55, 'fly');
      await sleep(60);
      keeperTo(kick.dive); sfx.dive();
      await sleep(400);
      await playOutcome(kick, true);
    }
    el.msg.textContent = { gol: '¡Gol!', parada: '¡Parada del portero!', fuera: '¡El balón se va fuera!' }[kick.outcome];
    await sleep(900);
    animating = false;
    if (pendingEnd) showEnd(pendingEnd);
  }

  async function playSecondIntro() {
    const c = st.cur;
    introFor = st.kicks.length;
    if (kickIndexShown !== introFor) { resetScene(); kickIndexShown = introFor; }
    disableZones(true);
    stopTimer();
    el.msg.textContent = `${st.players[c.side].name} chuta…`;
    el.shooter.classList.add('run');
    await sleep(450);
    sfx.kick();
    ballTo(50, 40, 0.75, 'hang');
    await sleep(60);
    keeperTo(c.firstDive); sfx.dive();
    await sleep(Math.max(200, (c.introMs || 1300) - 520));
    if (destroyed || st.cur?.phase !== 'second') return;
    const windowMs = c.windowMs;
    el.second.hidden = false;
    if (c.role === 'save') {
      el.second.innerHTML = `⚡ ¡REINCORPÓRATE! Elige otra dirección<div class="bar"><i id="sbar"></i></div>`;
      el.msg.textContent = '¡Segunda estirada! Rápido';
      zones.forEach((zb) => {
        const z = Number(zb.dataset.z);
        zb.disabled = z === c.firstDive;
        zb.classList.toggle('hide', z === c.firstDive);
        zb.classList.add('keeper-mode', 'urgent');
        zb.classList.remove('selected');
      });
      sfx.alarm();
    } else {
      el.second.innerHTML = `😱 ¡El portero intenta reincorporarse!<div class="bar"><i id="sbar"></i></div>`;
      el.msg.textContent = 'El portero se levanta…';
    }
    const bar = $('#sbar');
    const t0 = performance.now();
    const tick = () => {
      if (destroyed || el.second.hidden) return;
      const f = Math.max(0, 1 - (performance.now() - t0) / windowMs);
      bar.style.transform = `scaleX(${f})`;
      if (f > 0) requestAnimationFrame(tick);
    };
    tick();
  }

  // ---------------- Interacción ----------------
  function disableZones(dis) {
    zones.forEach((zb) => { zb.disabled = dis; zb.classList.remove('urgent', 'hide'); });
  }
  async function onZone(z) {
    const c = st?.cur;
    if (!c) return;
    if (c.phase === 'second' && c.role === 'save') {
      if (z === c.firstDive) return;
      disableZones(true);
      zones[z].classList.add('selected');
      sfx.select();
      const r = await ctx.emit('match:second', { zone: z });
      if (!r.ok) toast(r.error, 'err');
      return;
    }
    if (c.phase !== 'choose' || c.youChose || c.paused) return;
    selected = z;
    sfx.select();
    ctx.emit('match:mark', { zone: z });
    zones.forEach((zb) => zb.classList.toggle('selected', Number(zb.dataset.z) === z));
    renderControls();
  }
  async function confirmChoice() {
    if (selected == null) return;
    const btn = $('#confirm');
    if (btn) btn.disabled = true;
    const r = await ctx.emit('match:choose', { zone: selected });
    if (!r.ok) { toast(r.error, 'err'); if (btn) btn.disabled = false; }
    else sfx.click();
  }

  function renderControls() {
    const c = st.cur;
    let html = '';
    if (st.status === 'playing' && c?.phase === 'choose' && !c.paused) {
      if (!c.youChose) {
        html = `<button class="btn btn-primary btn-lg" id="confirm" ${selected == null ? 'disabled' : ''}>
          ${c.role === 'shoot' ? '✅ Confirmar disparo' : '🧤 Confirmar estirada'}${selected != null ? ` · ${ZONE_NAMES[selected]}` : ''}</button>`;
      } else {
        html = `<span class="chip">✔ Elección confirmada: ${ZONE_NAMES[c.yourChoice]}</span>
          <span class="chip">${c.opponentChose ? '🔒 El rival ya ha decidido' : '⏳ El rival está pensando…'}</span>`;
      }
    }
    if (st.status === 'playing' || st.status === 'starting') html += `<button class="btn btn-sm btn-ghost" id="forfeit">🏳️ Abandonar</button>`;
    if (st.status === 'finished') html = `<a class="btn btn-primary" href="#/sala" id="again">Nueva sala</a><a class="btn" href="#/inicio">Inicio</a>`;
    el.controls.innerHTML = html;
    $('#confirm') && ($('#confirm').onclick = confirmChoice);
    $('#forfeit') && ($('#forfeit').onclick = async () => {
      const ok = await confirmModal('¿Abandonar la tanda?', 'Si abandonas, pierdes el partido, se rompe tu racha y no recibes monedas.', { okText: 'Abandonar', danger: true });
      if (ok) ctx.emit('room:leave');
    });
    $('#again') && ($('#again').onclick = (e) => { e.preventDefault(); ctx.clearRoom(); });
  }

  // ---------------- Marcador, alineaciones, historial ----------------
  function renderScoreboard() {
    const kicksFor = (side) => st.kicks.filter((k) => k.side === side);
    const slots = Math.max(5, Math.ceil(st.kicks.length / 2) + (st.suddenDeath ? 1 : 0));
    const dots = (side) => {
      const ks = kicksFor(side);
      let h = '';
      for (let i = 0; i < slots; i++) {
        const k = ks[i];
        const isNext = !k && st.status === 'playing' && st.cur?.side === side && i === ks.length;
        h += `<span class="kdot ${k ? (k.outcome === 'gol' ? 'gol' : 'fail') : ''} ${isNext ? 'next' : ''}"></span>`;
      }
      return h;
    };
    const team = (side) => {
      const p = st.players[side];
      const turn = st.status === 'playing' && st.cur?.side === side;
      return `<div class="sb-team ${side ? 'right' : ''}">${crestSVG(crestOf(side))}
        <div style="min-width:0"><div class="sb-name">${turn ? '<span class="sb-turn" title="Lanza ahora"></span>' : ''}${esc(p.name)}${side === st.you ? ' (tú)' : ''}
        ${p.connected ? '' : '<span class="offline"> · desconectado</span>'}
        <small>${esc(p.shooter.name)} · ${esc(p.keeper.name)}</small></div><div class="sb-kicks">${dots(side)}</div></div></div>`;
    };
    el.sb.innerHTML = `${team(0)}<div class="sb-score">${st.score[0]} - ${st.score[1]}<small>${st.suddenDeath ? 'MUERTE SÚBITA' : `RONDA ${Math.min(st.round, 5)} DE 5`}</small></div>${team(1)}`;
  }
  function renderLineups() {
    el.lineups.innerHTML = st.players.map((p, i) => `<p style="margin:6px 0"><b>${esc(p.name)}${i === st.you ? ' (tú)' : ''}</b></p>
      <div class="mini-lineup">${cardHTML(p.shooter)}${cardHTML(p.keeper)}</div>`).join('');
    $$('.fcard', el.lineups).forEach((c) => c.style.setProperty('--w', '100px'));
  }
  function renderLog() {
    el.log.innerHTML = st.kicks.map((k, i) => {
      const icon = k.outcome === 'gol' ? '⚽' : k.outcome === 'parada' ? '🧤' : '❌';
      const extra = k.second ? ' · 2ª estirada' : '';
      return `<li><b>${i + 1}</b>${icon} <span><b style="color:var(--text)">${esc(st.players[k.side].name)}</b> · ${k.outcome === 'gol' ? 'Gol' : k.outcome === 'parada' ? 'Parada' : 'Fuera'}
        <span class="muted">(${ZONE_NAMES[k.zone]}${extra})</span></span></li>`;
    }).reverse().join('') || '<li class="muted">Aún no hay lanzamientos</li>';
  }
  function renderBanner() {
    const opp = st.players[1 - st.you];
    let h = '';
    if (st.status === 'playing' && !opp.connected) {
      h = `<div class="banner warn">📡 ${esc(opp.name)} se ha desconectado. La partida está en pausa. Si no vuelve en
        <b id="disc-left">${Math.ceil((opp.disconnectedLeftMs || 0) / 1000)}</b> s, ganarás por abandono.</div>`;
    }
    el.banner.innerHTML = h;
    if (h) {
      const t0 = performance.now(), base = opp.disconnectedLeftMs || 0;
      const iv = setInterval(() => {
        const n = $('#disc-left');
        if (!n || destroyed) return clearInterval(iv);
        n.textContent = Math.max(0, Math.ceil((base - (performance.now() - t0)) / 1000));
      }, 250);
    }
  }

  // ---------------- Temporizador ----------------
  function startTimer(leftMs, total) {
    timerDeadline = performance.now() + leftMs; timerTotal = total;
    cancelAnimationFrame(raf);
    let lastSec = -1;
    const tick = () => {
      const left = Math.max(0, timerDeadline - performance.now());
      el.timer.style.transform = `scaleX(${left / timerTotal})`;
      const s = Math.ceil(left / 1000);
      if (s !== lastSec && s <= 3 && s > 0 && st.cur && !st.cur.youChose) sfx.tick();
      lastSec = s;
      if (left > 0 && !destroyed) raf = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopTimer() { cancelAnimationFrame(raf); el.timer.style.transform = 'scaleX(0)'; }

  // ---------------- Actualización de estado ----------------
  let revealAt = 0, renderT = 0;
  function renderAll() { if (destroyed) return; renderScoreboard(); renderLineups(); renderLog(); renderBanner(); renderControls(); }
  function update(next) {
    const prevKicks = st?.kicks.length ?? -1;
    st = next;
    // Durante la animación no adelantamos el marcador: se actualiza cuando el balón llega.
    const wait = revealAt - Date.now();
    clearTimeout(renderT);
    if (wait > 0) renderT = setTimeout(renderAll, wait); else renderAll();
    const c = st.cur;
    if (st.status === 'finished') { stopTimer(); disableZones(true); if (st.result) onEnd(st.result); return; }
    if (!c) return;
    if (c.phase === 'choose') {
      if (kickIndexShown !== st.kicks.length && !animating) { resetScene(); kickIndexShown = st.kicks.length; selected = null; }
      else if (prevKicks !== st.kicks.length) selected = null;
      const doPrepare = () => {
        if (destroyed || st.cur?.phase !== 'choose') return;
        if (kickIndexShown !== st.kicks.length) { resetScene(); kickIndexShown = st.kicks.length; }
        const keeperMode = c.role === 'save';
        zones.forEach((zb) => {
          zb.classList.toggle('keeper-mode', keeperMode);
          zb.classList.remove('urgent', 'hide');
          const z = Number(zb.dataset.z);
          zb.classList.toggle('selected', c.youChose ? z === c.yourChoice : z === selected);
          zb.disabled = c.youChose || c.paused;
        });
        if (c.paused) {
          el.msg.textContent = '⏸ Partida en pausa: esperando reconexión';
          stopTimer();
        } else {
          el.msg.textContent = c.role === 'shoot'
            ? (c.youChose ? 'Disparo confirmado. Esperando al portero rival…' : '⚽ ¡TE TOCA LANZAR! Elige dónde tirar')
            : (c.youChose ? 'Estirada confirmada. Esperando al lanzador…' : '🧤 ¡TE TOCA PARAR! Elige dónde tirarte');
          startTimer(c.leftMs, ctx.state.meta.match.chooseMs);
        }
      };
      if (animating) setTimeout(doPrepare, Math.max(0, animDoneAt - Date.now())); else doPrepare();
      if (prevKicks !== st.kicks.length && !animating && st.kicks.length === 0) sfx.whistle();
    } else if (c.phase === 'second' && introFor !== st.kicks.length) {
      playSecondIntro();
    }
  }

  function onEnd(result) {
    if (endShown) return;
    if (animating) { pendingEnd = result; return; }
    showEnd(result);
  }
  function showEnd(result) {
    if (endShown || destroyed) return;
    endShown = true;
    pendingEnd = null;
    const won = result.winnerId === state.me.id;
    const rw = result.rewards || {};
    won ? sfx.win() : sfx.lose();
    const streak = rw.streak ?? 0;
    const need = state.meta.pick.winsNeeded;
    const prog = streak % need === 0 && streak > 0 ? need : streak % need;
    const m = modal(`
      <p class="result-title ${won ? 'win' : 'loss'}">${won ? '¡VICTORIA!' : 'DERROTA'}</p>
      <p class="center" style="font-family:var(--display);font-size:2.6rem;margin:0">${esc(st.players[0].name)} ${result.score[0]} - ${result.score[1]} ${esc(st.players[1].name)}</p>
      <p class="center muted">${esc(REASONS[result.reason] || result.reason)}</p>
      <p class="reward">+${rw.coins ?? 0} 🪙</p>
      <div class="center"><p style="margin:6px 0"><b>Racha de victorias: ${streak}</b></p>
        <div class="streak" style="justify-content:center">${Array.from({ length: need }, (_, i) => `<span class="dot ${i < prog ? 'on' : ''}">${i < prog ? '★' : ''}</span>`).join('')}</div>
        <p class="muted" style="margin:6px 0">${won ? `Cada ${need} victorias seguidas consigues un player pick.` : 'Perder rompe el progreso hacia el siguiente player pick.'}</p></div>
      ${rw.newPick ? `<div class="banner info center">🎁 ¡Has conseguido un PLAYER PICK por tu racha!</div>` : ''}
      <div class="modal-actions" style="justify-content:center">
        ${rw.newPick ? '<a class="btn btn-gold" href="#/picks" data-close>Elegir mi carta</a>' : ''}
        <button class="btn btn-primary" id="res-again">Nueva sala</button><a class="btn" href="#/inicio" data-close>Inicio</a></div>`);
    if (won) burst(document.body, { count: 80, colors: ['#ffd54a', '#27e36f', '#fff'], spread: 600 });
    $('#res-again', m.el).onclick = () => { m.close(); ctx.clearRoom(); location.hash = '#/sala'; };
    ctx.refreshMe();
  }

  return {
    update, onKick, onEnd,
    destroy() { destroyed = true; cancelAnimationFrame(raf); },
  };
}
