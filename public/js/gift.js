// Animación de regalo (estilo caja de botín): la caja cae, flota y tiembla; al tocarla
// se abre con un destello, sale confeti y se muestra lo que contiene.
import { $, esc, cardHTML, burst, rain } from './ui.js';
import { sfx } from './sound.js';

const CONFETTI = ['#ff3fa4', '#27e36f', '#2f7bff', '#ffd54a', '#b46bff', '#fff'];
const queue = [];
let showing = false;

// gift = { from, coins, card, pick }; getCard(id) devuelve la carta completa para dibujarla
export function showGift(gift, { getCard, onPicks } = {}) {
  queue.push({ gift, getCard, onPicks });
  if (!showing) next();
}

function next() {
  const item = queue.shift();
  if (!item) { showing = false; return; }
  showing = true;
  play(item);
}

function play({ gift, getCard, onPicks }) {
  const el = document.createElement('div');
  el.className = 'gift-overlay';
  el.innerHTML = `
    <div class="gift-rays"></div>
    <div class="gift-title"><small>🎁 REGALO DE</small><strong>${esc(gift.from)}</strong></div>
    <button class="gift-box" aria-label="Abrir regalo">
      <span class="gift-glow"></span>
      <span class="gift-lid"><i class="gift-bow"></i></span>
      <span class="gift-base"></span>
    </button>
    <p class="gift-hint">Toca la caja para abrirla</p>
    <div class="gift-content" hidden></div>`;
  document.body.appendChild(el);
  sfx.whoosh();
  setTimeout(() => sfx.boom(), 450);

  const box = $('.gift-box', el);
  let opened = false;
  box.addEventListener('click', async () => {
    if (opened) return;
    opened = true;
    $('.gift-hint', el).hidden = true;
    box.classList.add('shake');
    sfx.drumroll(0.9);
    await new Promise((r) => setTimeout(r, 900));
    box.classList.remove('shake');
    box.classList.add('open');
    el.classList.add('flash');
    sfx.boom(); sfx.sparkle();
    burst(el, { count: 120, colors: CONFETTI, spread: 520, x: '50%', y: '55%' });
    burst(el, { count: 40, colors: CONFETTI, spread: 300, star: true, x: '50%', y: '55%' });
    rain(el, { count: 140, colors: CONFETTI, duration: 3.5 });
    setTimeout(() => showContent(), 650);
  });

  function showContent() {
    const card = gift.card && getCard?.(gift.card.id);
    const parts = [];
    if (gift.coins) parts.push(`<div class="gift-coins"><span>+${Number(gift.coins).toLocaleString('es-ES')}</span> 🪙</div>`);
    if (card) parts.push(`<div class="gift-card">${cardHTML(card, { extraClass: 'shine' })}</div>`);
    else if (gift.card) parts.push(`<div class="gift-coins">${esc(gift.card.name)}</div>`);
    if (gift.pick) parts.push(`<div class="gift-pick">🎴 ¡Un <b>PLAYER PICK</b>! Elige 1 de 3 cartas</div>`);
    const c = $('.gift-content', el);
    c.innerHTML = `${parts.join('')}
      <div class="gift-actions">
        ${gift.pick ? '<button class="btn btn-gold" data-a="pick">Elegir mi carta</button>' : ''}
        <button class="btn btn-primary" data-a="close">¡Genial!</button>
      </div>`;
    c.hidden = false;
    if (gift.coins) sfx.coins();
    c.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      el.classList.add('closing');
      setTimeout(() => { el.remove(); if (a === 'pick') onPicks?.(); next(); }, 250);
    };
  }
}
