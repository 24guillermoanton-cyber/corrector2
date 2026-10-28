// =====================================================================
//  Ajustes del juego. Todo lo que afecta a la economía y al equilibrio
//  está aquí para poder retocarlo sin tocar la lógica.
// =====================================================================

export const ECONOMY = {
  startingCoins: 1000,     // monedas al crear la cuenta (da para los dos primeros sobres Bronce)
  winReward: 250,          // monedas por ganar una tanda
  lossReward: 50,          // monedas por perderla (si no abandonas)
  abandonReward: 0,        // monedas para quien abandona o se desconecta
  // Venta rápida de cartas repetidas (solo copias sobrantes)
  quickSell: { bronce: 10, plata: 25, oro: 60, elite: 120, toty: 300, futties: 300, icono: 5000, goat: 50000 },
  adminMaxCoinsAdjust: 10_000_000,
};

// Categorías de carta. Las normales dependen de la media.
export const TIERS = {
  bronce:  { name: 'Bronce',  special: false },
  plata:   { name: 'Plata',   special: false },
  oro:     { name: 'Oro',     special: false },
  elite:   { name: 'Élite',   special: false },
  toty:    { name: 'TOTY',    special: true },
  futties: { name: 'FUTTIES', special: true },
  icono:   { name: 'Icono',   special: true },
  goat:    { name: 'GOAT 99', special: true },
};

// Sobres: cada uno da 1 futbolista de campo y 1 portero, salvo que indique `players`/`keepers`.
// Dentro de un mismo sobre no se repite carta y se intenta no repetir posición.
// Las probabilidades (en %) se aplican por separado a cada carta y deben sumar 100.
export const PACKS = [
  { id: 'bronce', name: 'Sobre Bronce', price: 500,
    odds: { bronce: 70, plata: 25, oro: 5, elite: 0, toty: 0, futties: 0 } },
  { id: 'plata', name: 'Sobre Plata', price: 1500,
    odds: { bronce: 25, plata: 50, oro: 22, elite: 3, toty: 0, futties: 0 } },
  { id: 'oro', name: 'Sobre Oro', price: 4000,
    odds: { bronce: 0, plata: 30, oro: 55, elite: 12, toty: 1.5, futties: 1.5 } },
  { id: 'elite', name: 'Sobre Élite', price: 150000,
    odds: { bronce: 0, plata: 0, oro: 49.8, elite: 38, toty: 6, futties: 6, goat: 0.2 } },
  { id: 'icono', name: 'Sobre Icono', price: 500000,
    odds: { icono: 100 } },
  { id: 'mega', name: 'Sobre Mega', price: 5_000_000, players: 7, keepers: 3,
    odds: { oro: 30, elite: 35, toty: 12, futties: 12, icono: 10, goat: 1 } },
];
// Copia transferible de cada sobre: mismas probabilidades, el doble de precio, y sus
// cartas se pueden vender en el mercado de transferibles.
PACKS.push(...PACKS.map((p) => ({ ...p, id: `${p.id}-t`, name: `${p.name} transferible`, price: p.price * 2, tradable: true })));

// Mercado de transferibles
export const MARKET = {
  minPrice: 100,
  maxPrice: 10_000_000,
  durationsMin: [5, 60, 180, 720, 1440],  // 5 min, 1 h, 3 h, 12 h, 24 h
  taxPct: 0.05,            // el vendedor cobra el 95 % (impuesto del 5 %)
  minIncrement: 50,        // puja mínima: +50 o +5 %, lo que sea mayor
  incrementPct: 0.05,
  extendSeconds: 30,       // pujar en los últimos segundos alarga la subasta hasta 30 s
  maxActivePerUser: 30,
};

// Player picks por racha de victorias seguidas. Cada pick ofrece 3 cartas dentro de un rango
// de media; dentro del rango, cuanto más alta la media, menos probable (factor por punto).
export const PICK = {
  winsNeeded: 3,            // primer pick (se usa en los textos y el progreso)
  options: 3,
  levels: [
    { wins: 3, min: 75, max: 85 },
    { wins: 5, min: 80, max: 88 },
    { wins: 10, min: 89, max: 99 },  // y cada 10 victorias más (20, 30…)
  ],
  weightPerPoint: 0.8,
};

// Rango de un pick según la racha (null si esa racha no da pick). Los picks del admin usan el mejor.
export function pickLevel(streak) {
  if (streak == null) return PICK.levels.at(-1);
  const exact = PICK.levels.find((l) => l.wins === streak);
  if (exact) return exact;
  const top = PICK.levels.at(-1);
  return streak > top.wins && streak % top.wins === 0 ? top : null;
}

// Reglas de la tanda y tiempos (milisegundos).
export const MATCH = {
  kicksPerTeam: 5,
  chooseMs: Number(process.env.MATCH_CHOOSE_MS) || 15_000, // tiempo para elegir disparo / estirada
  afterKickMs: 2_000,        // pausa para ver la animación del resultado
  secondPhaseIntroMs: 1_300, // carrera + disparo + primera estirada antes de la ventana
  startCountdownMs: 3_500,
  disconnectGraceMs: 30_000, // tiempo para reconectar antes de perder por abandono
  waitingRoomTtlMs: 15 * 60_000,
  networkGraceMs: 400,       // margen extra por latencia en la segunda estirada
};

// Resolución de cada penalti (ver README y tutorial).
export const SHOT = {
  // Probabilidad base de mandarla fuera por altura (arriba, media, abajo).
  missBase: [0.12, 0.05, 0.06],
  // Ajuste de la potencia del disparo concreto: potencia + aleatorio entre [min, max]
  powerJitter: [-10, 5],
  // Parada cuando el portero adivina la zona:
  save: {
    base: 0.70,
    perParada: 0.008,     // por punto de "parada" sobre 50
    perReflejos: 0.004,   // por punto de "reflejos" sobre 50
    perPotencia: -0.006,  // por punto de potencia del disparo sobre 50
    perCalidad: -0.004,   // por punto de calidad de lanzamiento sobre 50
    rowBonus: [-0.12, 0, 0.05], // escuadras más difíciles, abajo algo más fácil
    min: 0.45,
    max: 0.95,
  },
  // Segunda estirada (reincorporación)
  second: {
    tiers: ['oro', 'elite', 'toty', 'futties', 'icono', 'goat'], // solo porteros dorados o superiores (bronce y plata no)
    chance: 0.40,         // probabilidad de "¡DOBLE PARADA!" si un portero bueno falla el lado
    patternCircles: 5,    // círculos del minijuego (tocarlos en orden)
    minigameMs: 6_000,    // tiempo para completar el patrón
    lowRecoveryBelow: 80, // porteros con reincorporación por debajo de esto…
    lowMinigameMs: 3_000, // …solo tienen 3 segundos
    diveMs: 1_000,        // si lo completas: 1 segundo para volver a tirarte
    saveFactor: 0.65,     // la parada en segunda estirada es más difícil
  },
};

export const ZONES = ['Arriba izquierda', 'Arriba derecha', 'Media izquierda', 'Media derecha', 'Abajo izquierda', 'Abajo derecha'];

// Títulos que el administrador puede poner a un jugador (se ven junto a su nombre para todos).
export const TITLES = {
  og:      { name: 'OG' },
  leyenda: { name: 'LEYENDA' },
  rey:     { name: 'REY' },
  vip:     { name: 'VIP' },
  crack:   { name: 'CRACK' },
};

// Escudos disponibles al registrarse (el cliente los dibuja en SVG).
export const CRESTS = [
  { id: 'c01', name: 'Leones Rojos',     shape: 'shield',  c1: '#c8102e', c2: '#ffd700', pattern: 'plain',   symbol: 'lion' },
  { id: 'c02', name: 'Atlético Azul',    shape: 'shield',  c1: '#0b3d91', c2: '#ffffff', pattern: 'stripes', symbol: 'star' },
  { id: 'c03', name: 'Real Blanco',      shape: 'round',   c1: '#f5f5f5', c2: '#5b2a86', pattern: 'plain',   symbol: 'crown' },
  { id: 'c04', name: 'Deportivo Verde',  shape: 'shield',  c1: '#00843d', c2: '#ffffff', pattern: 'half',    symbol: 'ball' },
  { id: 'c05', name: 'Unión Naranja',    shape: 'diamond', c1: '#ff6a00', c2: '#1a1a1a', pattern: 'sash',    symbol: 'bolt' },
  { id: 'c06', name: 'Club Celeste',     shape: 'round',   c1: '#6cace4', c2: '#ffffff', pattern: 'stripes', symbol: 'sun' },
  { id: 'c07', name: 'Racing Negro',     shape: 'shield',  c1: '#111111', c2: '#e8c547', pattern: 'chevron', symbol: 'star' },
  { id: 'c08', name: 'Sporting Granate', shape: 'diamond', c1: '#7a1f3d', c2: '#7fd1ff', pattern: 'half',    symbol: 'ball' },
  { id: 'c09', name: 'Olímpico Dorado',  shape: 'round',   c1: '#b8860b', c2: '#1b1b1b', pattern: 'cross',   symbol: 'crown' },
  { id: 'c10', name: 'Marea Turquesa',   shape: 'shield',  c1: '#00a19a', c2: '#0b2545', pattern: 'sash',    symbol: 'wave' },
  { id: 'c11', name: 'Rayo Morado',      shape: 'diamond', c1: '#6a0dad', c2: '#f2e94e', pattern: 'chevron', symbol: 'bolt' },
  { id: 'c12', name: 'Ciudad Rosa',      shape: 'round',   c1: '#e7298a', c2: '#ffffff', pattern: 'cross',   symbol: 'sun' },
];
