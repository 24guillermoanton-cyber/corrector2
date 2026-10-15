// Efectos de sonido sintetizados con Web Audio (sin archivos externos).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('ps-muted') === '1'; } catch { /* sin almacenamiento */ }

function ac() {
  if (muted) return null;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

export function isMuted() { return muted; }
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('ps-muted', v ? '1' : '0'); } catch { /* nada */ }
}

function tone(freq, dur, { type = 'sine', vol = 0.2, delay = 0, slide = null } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, { vol = 0.2, delay = 0, filter = 'lowpass', freq = 1000, freqEnd = null, attack = 0.02 } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t); src.stop(t + dur);
}

export const sfx = {
  click() { tone(660, 0.06, { type: 'triangle', vol: 0.08 }); },
  select() { tone(520, 0.08, { type: 'triangle', vol: 0.1 }); tone(780, 0.1, { type: 'triangle', vol: 0.1, delay: 0.06 }); },
  whistle() { tone(2100, 0.18, { type: 'sine', vol: 0.12 }); tone(2300, 0.35, { type: 'sine', vol: 0.12, delay: 0.22 }); },
  kick() { tone(140, 0.18, { type: 'sine', vol: 0.5, slide: 50 }); noise(0.08, { vol: 0.3, freq: 2500 }); },
  dive() { noise(0.35, { vol: 0.12, filter: 'bandpass', freq: 600, freqEnd: 200 }); },
  goal() {
    noise(2.6, { vol: 0.35, filter: 'bandpass', freq: 900, freqEnd: 1400, attack: 0.25 });
    noise(0.25, { vol: 0.2, freq: 400, delay: 0.02 });
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.05, delay: 0.2 + i * 0.1 }));
  },
  save() { tone(220, 0.12, { type: 'square', vol: 0.15 }); noise(1.6, { vol: 0.22, filter: 'lowpass', freq: 700, freqEnd: 250, attack: 0.15 }); },
  miss() { noise(1.4, { vol: 0.2, filter: 'lowpass', freq: 600, freqEnd: 200, attack: 0.2 }); tone(300, 0.5, { type: 'sawtooth', vol: 0.04, slide: 120 }); },
  tick() { tone(1200, 0.04, { type: 'square', vol: 0.05 }); },
  alarm() { tone(880, 0.12, { type: 'square', vol: 0.12 }); tone(880, 0.12, { type: 'square', vol: 0.12, delay: 0.16 }); },
  whoosh() { noise(0.6, { vol: 0.3, filter: 'bandpass', freq: 300, freqEnd: 3000, attack: 0.3 }); },
  drumroll(dur = 1.2) { for (let t = 0; t < dur; t += 0.06) noise(0.05, { vol: 0.08 + (t / dur) * 0.15, freq: 300, delay: t }); },
  boom() { tone(80, 0.9, { type: 'sine', vol: 0.6, slide: 30 }); noise(0.6, { vol: 0.25, freq: 300 }); },
  sparkle() { [1318, 1568, 2093, 2637, 3136].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.06, delay: i * 0.07 })); },
  fanfare(level = 1) {
    const chord = level >= 3 ? [523, 659, 784, 1046] : level >= 2 ? [440, 554, 659] : [392, 494];
    chord.forEach((f, i) => tone(f, 0.9, { type: 'sawtooth', vol: 0.05, delay: i * 0.05 }));
    if (level >= 3) chord.forEach((f, i) => tone(f * 2, 0.6, { type: 'triangle', vol: 0.04, delay: 0.5 + i * 0.08 }));
  },
  coins() { [988, 1319].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.06, delay: i * 0.08 })); },
  win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'square', vol: 0.07, delay: i * 0.13 })); },
  lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.1, delay: i * 0.2 })); },
};
