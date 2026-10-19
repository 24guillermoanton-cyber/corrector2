// =====================================================================
//  Catálogo de cartas.
//
//  AVISO: los nombres son de futbolistas reales, pero las valoraciones son
//  ORIENTATIVAS DE JUEGO, inventadas para este proyecto a partir de su fama
//  como lanzadores / paradores de penaltis. No son estadísticas verificadas
//  ni oficiales, y el juego no está afiliado a ningún club, liga ni editor.
//
//  - La media de un futbolista representa sobre todo lo bien que tira penaltis:
//      media = 50% precisión + 20% potencia + 30% calidad de lanzamiento
//  - La media de un portero representa su capacidad para pararlos:
//      media = 50% parada + 30% reflejos + 20% reincorporación
// =====================================================================

// [nombre, posición, nacionalidad, valoración base, perfil]
// Perfiles de lanzador: P = preciso, F = potente, T = técnico, B = equilibrado
const PLAYERS = [
  // Élite
  ['Harry Kane', 'DC', 'Inglaterra', 91, 'P'],
  ['Robert Lewandowski', 'DC', 'Polonia', 89, 'P'],
  ['Cole Palmer', 'MCO', 'Inglaterra', 89, 'T'],
  ['Bruno Fernandes', 'MCO', 'Portugal', 88, 'T'],
  ['Cristiano Ronaldo', 'DC', 'Portugal', 88, 'F'],
  ['Kylian Mbappé', 'DC', 'Francia', 87, 'F'],
  ['Jorginho', 'MC', 'Italia', 86, 'P'],
  ['Mohamed Salah', 'ED', 'Egipto', 86, 'B'],
  ['Erling Haaland', 'DC', 'Noruega', 86, 'F'],
  ['Lionel Messi', 'ED', 'Argentina', 86, 'T'],
  // Oro
  ['Antoine Griezmann', 'SD', 'Francia', 84, 'T'],
  ['Ivan Toney', 'DC', 'Inglaterra', 84, 'P'],
  ['Gerard Moreno', 'DC', 'España', 83, 'P'],
  ['Mikel Oyarzabal', 'EI', 'España', 82, 'P'],
  ['Lautaro Martínez', 'DC', 'Argentina', 82, 'B'],
  ['Romelu Lukaku', 'DC', 'Bélgica', 82, 'F'],
  ['Ciro Immobile', 'DC', 'Italia', 82, 'B'],
  ['Iago Aspas', 'DC', 'España', 82, 'T'],
  ['Julián Álvarez', 'DC', 'Argentina', 81, 'B'],
  ['Alexander Isak', 'DC', 'Suecia', 81, 'B'],
  ['Jude Bellingham', 'MCO', 'Inglaterra', 80, 'B'],
  ['Bukayo Saka', 'ED', 'Inglaterra', 80, 'T'],
  ['Dušan Vlahović', 'DC', 'Serbia', 80, 'F'],
  ['Martin Ødegaard', 'MCO', 'Noruega', 79, 'T'],
  ['Son Heung-min', 'EI', 'Corea del Sur', 79, 'B'],
  ['Lamine Yamal', 'ED', 'España', 79, 'T'],
  ['Dani Parejo', 'MC', 'España', 78, 'P'],
  ['Victor Osimhen', 'DC', 'Nigeria', 78, 'F'],
  ['Vinícius Júnior', 'EI', 'Brasil', 77, 'F'],
  ['Álvaro Morata', 'DC', 'España', 77, 'B'],
  ['Ollie Watkins', 'DC', 'Inglaterra', 76, 'B'],
  // Plata
  ['Borja Iglesias', 'DC', 'España', 74, 'B'],
  ['Joselu', 'DC', 'España', 74, 'F'],
  ['Ante Budimir', 'DC', 'Croacia', 74, 'P'],
  ['Raúl de Tomás', 'DC', 'España', 73, 'T'],
  ['Alexander Sørloth', 'DC', 'Noruega', 72, 'F'],
  ['Ayoze Pérez', 'SD', 'España', 72, 'T'],
  ['Vedat Muriqi', 'DC', 'Kosovo', 71, 'F'],
  ['Iñaki Williams', 'DC', 'Ghana', 70, 'F'],
  ['Enes Ünal', 'DC', 'Turquía', 70, 'B'],
  ['Óscar Trejo', 'MCO', 'Argentina', 69, 'T'],
  ['Nico Williams', 'EI', 'España', 68, 'F'],
  ['Cyle Larin', 'DC', 'Canadá', 67, 'B'],
  // Bronce
  ['Lucas Pérez', 'DC', 'España', 64, 'T'],
  ['Cristhian Stuani', 'DC', 'Uruguay', 64, 'P'],
  ['Rubén Castro', 'DC', 'España', 64, 'B'],
  ['Aritz Aduriz', 'DC', 'España', 63, 'F'],
  ['Raúl García', 'MCO', 'España', 63, 'B'],
  ['Rafa Mir', 'DC', 'España', 63, 'F'],
  ['Hugo Duro', 'DC', 'España', 62, 'B'],
  ['Kike García', 'DC', 'España', 62, 'F'],
  ['Jorge Molina', 'DC', 'España', 61, 'P'],
  ['Sergi Enrich', 'DC', 'España', 60, 'F'],
];

// Perfiles de portero: R = reflejos, S = parador, A = ágil (gran reincorporación)
const KEEPERS = [
  // Élite
  ['Emiliano Martínez', 'POR', 'Argentina', 90, 'R'],
  ['Thibaut Courtois', 'POR', 'Bélgica', 89, 'S'],
  ['Diogo Costa', 'POR', 'Portugal', 89, 'A'],
  ['Alisson Becker', 'POR', 'Brasil', 88, 'S'],
  ['Yassine Bounou', 'POR', 'Marruecos', 88, 'R'],
  ['Jan Oblak', 'POR', 'Eslovenia', 87, 'S'],
  ['Mike Maignan', 'POR', 'Francia', 87, 'A'],
  ['Gianluigi Donnarumma', 'POR', 'Italia', 87, 'R'],
  ['Marc-André ter Stegen', 'POR', 'Alemania', 86, 'A'],
  ['Unai Simón', 'POR', 'España', 86, 'R'],
  // Oro
  ['Dominik Livaković', 'POR', 'Croacia', 84, 'R'],
  ['David Raya', 'POR', 'España', 83, 'A'],
  ['Gregor Kobel', 'POR', 'Suiza', 83, 'S'],
  ['Giorgi Mamardashvili', 'POR', 'Georgia', 83, 'R'],
  ['Ederson', 'POR', 'Brasil', 82, 'A'],
  ['Wojciech Szczęsny', 'POR', 'Polonia', 82, 'S'],
  ['Álex Remiro', 'POR', 'España', 82, 'S'],
  ['Jordan Pickford', 'POR', 'Inglaterra', 82, 'R'],
  ['Yann Sommer', 'POR', 'Suiza', 81, 'A'],
  ['Andriy Lunin', 'POR', 'Ucrania', 80, 'R'],
  ['André Onana', 'POR', 'Camerún', 79, 'A'],
  ['Bart Verbruggen', 'POR', 'Países Bajos', 79, 'R'],
  ['Kepa Arrizabalaga', 'POR', 'España', 79, 'R'],
  // Plata
  ['Joan García', 'POR', 'España', 74, 'A'],
  ['David Soria', 'POR', 'España', 74, 'S'],
  ['Rui Silva', 'POR', 'Portugal', 73, 'R'],
  ['Aitor Fernández', 'POR', 'España', 72, 'S'],
  ['Stole Dimitrievski', 'POR', 'Macedonia del Norte', 72, 'R'],
  ['Paulo Gazzaniga', 'POR', 'Argentina', 72, 'A'],
  ['Sergio Herrera', 'POR', 'España', 71, 'S'],
  ['Fernando Pacheco', 'POR', 'España', 70, 'A'],
  ['Rubén Blanco', 'POR', 'España', 68, 'R'],
  ['Diego Mariño', 'POR', 'España', 67, 'A'],
  // Bronce
  ['Matías Dituro', 'POR', 'Argentina', 64, 'S'],
  ['Andrés Fernández', 'POR', 'España', 64, 'R'],
  ['Edgar Badía', 'POR', 'España', 63, 'A'],
  ['Dani Martín', 'POR', 'España', 62, 'S'],
  ['Iván Villar', 'POR', 'España', 61, 'A'],
  ['Álvaro Ratón', 'POR', 'España', 60, 'R'],
];

// Cartas especiales: [nombre base, categoría, mejora de estadísticas]
// Iconos: leyendas retiradas. Mismo formato que arriba; su categoría es siempre 'icono'.
const ICONS = [
  ['Pelé', 'DC', 'Brasil', 95, 'T'],
  ['Diego Maradona', 'MCO', 'Argentina', 95, 'T'],
  ['Zinedine Zidane', 'MCO', 'Francia', 94, 'T'],
  ['Ronaldo Nazário', 'DC', 'Brasil', 94, 'F'],
  ['Johan Cruyff', 'DC', 'Países Bajos', 93, 'T'],
  ['Andrea Pirlo', 'MC', 'Italia', 93, 'P'],
  ['Francesco Totti', 'SD', 'Italia', 92, 'P'],
  ['Ronaldinho', 'MCO', 'Brasil', 92, 'T'],
  ['Thierry Henry', 'DC', 'Francia', 92, 'B'],
  ['Eusébio', 'DC', 'Portugal', 92, 'F'],
  ['Marco van Basten', 'DC', 'Países Bajos', 92, 'B'],
  ['Roberto Baggio', 'SD', 'Italia', 91, 'P'],
  ['Zlatan Ibrahimović', 'DC', 'Suecia', 91, 'F'],
  ['Alan Shearer', 'DC', 'Inglaterra', 91, 'F'],
  ['Wayne Rooney', 'DC', 'Inglaterra', 90, 'F'],
  ['Raúl González', 'DC', 'España', 90, 'B'],
  ['Andrés Iniesta', 'MC', 'España', 90, 'T'],
  ['Xavi Hernández', 'MC', 'España', 89, 'P'],
  ['Fernando Torres', 'DC', 'España', 89, 'F'],
  ['Lev Yashin', 'POR', 'Unión Soviética', 95, 'S'],
  ['Gianluigi Buffon', 'POR', 'Italia', 94, 'S'],
  ['Iker Casillas', 'POR', 'España', 93, 'A'],
  ['Oliver Kahn', 'POR', 'Alemania', 93, 'R'],
  ['Peter Schmeichel', 'POR', 'Dinamarca', 92, 'A'],
  ['Petr Čech', 'POR', 'Chequia', 91, 'S'],
];

// [nombre, categoría, mejora de todas las estadísticas | 'max' (todas a 99)]
const SPECIALS = [
  ['Harry Kane', 'toty', 5],
  ['Kylian Mbappé', 'toty', 6],
  ['Jude Bellingham', 'toty', 10],
  ['Robert Lewandowski', 'toty', 5],
  ['Thibaut Courtois', 'toty', 5],
  ['Emiliano Martínez', 'toty', 5],
  ['Mike Maignan', 'toty', 6],
  ['Cole Palmer', 'futties', 6],
  ['Lamine Yamal', 'futties', 'max'],
  ['Bruno Fernandes', 'futties', 6],
  ['Antoine Griezmann', 'futties', 8],
  ['Diogo Costa', 'futties', 6],
  ['Unai Simón', 'futties', 7],
  ['Yassine Bounou', 'futties', 6],
];

const PLAYER_PROFILES = {
  P: { precision: 5, potencia: -6, calidad: 0 },
  F: { precision: -3, potencia: 9, calidad: -1 },
  T: { precision: 2, potencia: -5, calidad: 5 },
  B: { precision: 1, potencia: -1, calidad: 1 },
};
const KEEPER_PROFILES = {
  R: { reflejos: 6, parada: 1, reincorporacion: -6 },
  S: { reflejos: -2, parada: 4, reincorporacion: -4 },
  A: { reflejos: 2, parada: -4, reincorporacion: 10 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Pequeña variación determinista por nombre para que no todas las cartas sean idénticas.
function jitter(name, salt) {
  let h = 2166136261;
  for (const ch of name + salt) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 5) - 2; // -2..+2
}

export function playerOverall(s) {
  return Math.round(0.5 * s.precision + 0.2 * s.potencia + 0.3 * s.calidad);
}
export function keeperOverall(s) {
  return Math.round(0.5 * s.parada + 0.3 * s.reflejos + 0.2 * s.reincorporacion);
}

export function tierFor(rating) {
  if (rating >= 85) return 'elite';
  if (rating >= 75) return 'oro';
  if (rating >= 65) return 'plata';
  return 'bronce';
}

function buildCard(row, type) {
  const [name, position, nation, base, profile] = row;
  const prof = type === 'jugador' ? PLAYER_PROFILES[profile] : KEEPER_PROFILES[profile];
  const stats = {};
  for (const [k, d] of Object.entries(prof)) stats[k] = clamp(base + d + jitter(name, k), 30, 99);
  const rating = type === 'jugador' ? playerOverall(stats) : keeperOverall(stats);
  return {
    id: `${type === 'jugador' ? 'j' : 'p'}-${slug(name)}`,
    name, position, nation, type, rating, stats,
    tier: tierFor(rating),
  };
}

const base = [
  ...PLAYERS.map((r) => buildCard(r, 'jugador')),
  ...KEEPERS.map((r) => buildCard(r, 'portero')),
];

const icons = ICONS.map((r) => {
  const c = buildCard(r, r[1] === 'POR' ? 'portero' : 'jugador');
  return { ...c, id: `icono-${c.id}`, tier: 'icono', special: true };
});

const specials = SPECIALS.map(([name, tier, boost]) => {
  const b = base.find((c) => c.name === name);
  if (!b) throw new Error(`Carta base no encontrada: ${name}`);
  const stats = {};
  for (const [k, v] of Object.entries(b.stats)) stats[k] = boost === 'max' ? 99 : clamp(v + boost, 30, 99);
  const rating = b.type === 'jugador' ? playerOverall(stats) : keeperOverall(stats);
  return { ...b, id: `${tier}-${b.id}`, tier, stats, rating, special: true };
});

export const CARDS = [...base, ...specials, ...icons];
export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function cardsOf(type, tier) {
  return CARDS.filter((c) => c.type === type && c.tier === tier);
}

// Comprobación de integridad: cada categoría debe tener jugadores y porteros.
for (const t of ['bronce', 'plata', 'oro', 'elite', 'toty', 'futties', 'icono']) {
  for (const type of ['jugador', 'portero']) {
    if (!cardsOf(type, t).length) throw new Error(`Falta ${type} en categoría ${t}`);
  }
}
