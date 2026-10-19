// Animación de apertura de sobres: escenario con focos, túnel de luces, pistas y revelación.
import { $, esc, cardHTML, burst, rain, TIER_NAMES } from './ui.js';
import { sfx } from './sound.js';

const QUALITY = { bronce: 0, plata: 1, oro: 2, elite: 3, toty: 4, futties: 4, icono: 5 };
const COLOR = { bronce: '#e0a571', plata: '#dfe6ee', oro: '#ffd54a', elite: '#ffc21a', toty: '#2f7bff', futties: '#ff3fa4', icono: '#f5e1a4' };
const PARTICLES = {
  bronce: ['#e0a571', '#fff'], plata: ['#fff', '#cfd6de'], oro: ['#ffd54a', '#fff6b0', '#fff'],
  elite: ['#ffd54a', '#ff9900', '#fff'], toty: ['#2f7bff', '#9cc6ff', '#ffd54a', '#fff'], futties: ['#ff3fa4', '#ffb3df', '#b46bff', '#fff'],
  icono: ['#fff8e1', '#f5e1a4', '#d4af37', '#fff'],
};

export function openPackAnimation({ pack, cards, onAgain, onCollection, onClose, title }) {
  const el = document.createElement('div');
  el.className = 'opening';
  el.innerHTML = `
    <div class="tunnel">${'<div class="ring"></div>'.repeat(6)}<div class="spot s1"></div><div class="spot s2"></div><div class="floor"></div></div>
    <div class="aurora"></div><div class="rays"></div><div class="halo"></div><div class="flash"></div>
    <button class="btn btn-sm skip">Saltar animación ⏭</button>
    <div class="stage"></div>`;
  document.body.appendChild(el);
  $$rings(el);
  const stage = $('.stage', el);
  const rays = $('.rays', el);
  const halo = $('.halo', el);
  const setSpecial = (tier) => { el.classList.remove('special-toty', 'special-futties', 'special-icono'); halo.classList.remove('on'); if (tier) { void el.offsetWidth; el.classList.add('special-' + tier); } };
  const flash = () => { const f = $('.flash', el); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };
  const setColor = (c) => el.style.setProperty('--tc', c);

  let skipped = false;
  let wake = null;
  const wait = (ms) => new Promise((r) => { if (skipped) return r(); const t = setTimeout(r, ms); wake = () => { clearTimeout(t); r(); }; });
  const tap = (btnText) => new Promise((r) => {
    if (skipped) return r();
    const b = document.createElement('button');
    b.className = 'btn btn-primary btn-lg'; b.textContent = btnText;
    b.onclick = () => { sfx.click(); r(); };
    stage.appendChild(b);
    wake = r;
  });
  $('.skip', el).onclick = () => { skipped = true; wake?.(); };

  function close() { el.remove(); onClose?.(); }

  function summary() {
    rays.classList.remove('on');
    setSpecial(null);
    setColor(COLOR[cards.reduce((best, c) => (QUALITY[c.tier] > QUALITY[best.tier] ? c : best), cards[0]).tier]);
    $('.skip', el).hidden = true;
    stage.innerHTML = `
      <div class="clue"><small>${esc(title || pack?.name || 'Recompensa')}</small><strong style="font-size:2.4rem">¡Lo que te ha tocado!</strong></div>
      <div class="summary">${cards.map((c) => `<div class="center">${cardHTML(c, { extraClass: 'shine' })}
        <div style="margin-top:8px"><span class="${c.isNew === false ? 'label-dup' : 'label-new'}">${c.isNew === false ? 'REPETIDA' : '¡NUEVA!'}</span></div></div>`).join('')}</div>
      <div class="row" style="justify-content:center">
        ${onAgain ? `<button class="btn btn-gold" data-a="again">Abrir otro (${pack.price} 🪙)</button>` : ''}
        ${onCollection ? '<button class="btn" data-a="col">Ver colección</button>' : ''}
        <button class="btn btn-primary" data-a="close">Continuar</button>
      </div>`;
    stage.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') close();
      if (a === 'col') { el.remove(); onCollection(); }
      if (a === 'again') { el.remove(); onAgain(); }
    };
  }

  async function revealCard(card, idx) {
    const q = QUALITY[card.tier];
    stage.innerHTML = `<div class="clue"><small>CARTA ${idx + 1} DE ${cards.length}</small><strong>${card.type === 'portero' ? 'PORTERO' : 'LANZADOR'}</strong></div>`;
    setColor('#ffffff');
    rays.classList.remove('on');
    setSpecial(null);
    sfx.drumroll(q >= 2 ? 1.6 : 0.8);
    await wait(q >= 2 ? 1200 : 650);
    if (skipped) return;
    // El color de las luces anticipa la categoría
    setColor(COLOR[card.tier]); flash();
    if (q >= 3) sfx.boom(); else sfx.whoosh();
    if (card.tier === 'toty') rain(el, { count: 60, colors: PARTICLES.toty, star: true });
    if (card.tier === 'futties') rain(el, { count: 70, colors: PARTICLES.futties });
    if (card.tier === 'icono') rain(el, { count: 90, colors: PARTICLES.icono, star: true });
    if (q >= 4) {
      // Escenario especial: aurora de color, temblor, halo y lluvia continua
      setSpecial(card.tier); sfx.boom(); sfx.sparkle();
      stage.innerHTML = `<div class="clue"><small>CARTA ESPECIAL</small><strong style="color:${COLOR[card.tier]}">${{ toty: 'TEAM OF THE YEAR', futties: 'FUTTIES', icono: 'ICONO' }[card.tier]}</strong></div>`;
      await wait(1300);
    }
    if (q >= 2) {
      stage.innerHTML = `<div class="clue"><small>NACIONALIDAD</small><strong>${esc(card.nation)}</strong></div>`;
      sfx.tick();
      await wait(1000);
      stage.innerHTML = `<div class="clue"><small>POSICIÓN</small><strong>${esc(card.position)}</strong></div>`;
      sfx.tick();
      await wait(1000);
    }
    if (q >= 3) {
      stage.innerHTML = `<div class="clue"><small>MEDIA</small><strong style="color:${COLOR[card.tier]}">${card.rating}</strong></div>`;
      sfx.tick();
      await wait(1000);
    }
    if (skipped) return;
    flash();
    if (q >= 2) rays.classList.add('on');
    if (q >= 4) {
      halo.classList.add('on');
      rain(el, { count: 80, colors: PARTICLES[card.tier], star: card.tier === 'toty', duration: 4 });
      setTimeout(() => !skipped && burst(el, { count: 60, colors: PARTICLES[card.tier], spread: 700, star: true }), 450);
      sfx.fanfare(3);
    }
    burst(el, { count: 16 + q * 18, colors: PARTICLES[card.tier], spread: 260 + q * 90, star: q >= 3 });
    sfx.fanfare(Math.max(1, q)); if (q >= 3) sfx.sparkle();
    stage.innerHTML = `<div class="reveal-card">${cardHTML(card, { extraClass: 'shine' })}</div>
      <div class="clue"><strong style="font-size:2.2rem">${esc(card.name)}</strong><small>${TIER_NAMES[card.tier].toUpperCase()} · MEDIA ${card.rating}</small></div>
      <span class="${card.isNew === false ? 'label-dup' : 'label-new'}">${card.isNew === false ? 'REPETIDA' : '¡NUEVA!'}</span>`;
    await wait(500);
    await tap(idx < cards.length - 1 ? 'Siguiente carta ▶' : 'Ver resumen');
  }

  (async () => {
    setColor(COLOR[pack?.id] || '#ffd54a');
    if (pack) {
      stage.innerHTML = `<div class="clue"><small>${esc(pack.name)}</small></div>
        <div class="pack-big"><div class="pack-art p-${esc(pack.id)}"><span class="pk-ball">⚽</span><span class="pname">${esc(pack.name.replace('Sobre ', '').toUpperCase())}</span></div></div>
        <p class="muted">Toca el sobre para abrirlo</p>`;
      const big = $('.pack-big', stage);
      await new Promise((r) => { big.onclick = r; wake = r; setTimeout(r, 2500); });
      if (!skipped) {
        big.classList.add('shake'); sfx.whoosh();
        await wait(520);
        flash(); sfx.boom();
        burst(el, { count: 40, colors: ['#fff', '#ffd54a'], spread: 500 });
        await wait(400);
      }
    }
    for (let i = 0; i < cards.length && !skipped; i++) await revealCard(cards[i], i);
    summary();
  })();
}

function $$rings(el) {
  [...el.querySelectorAll('.ring')].forEach((r, i) => { r.style.animationDelay = `${i * 0.27}s`; });
}
