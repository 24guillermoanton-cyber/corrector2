// =====================================================================
//  Catálogo de cartas.
//
//  AVISO: los nombres son de futbolistas reales. La media de cada carta se
//  aproxima a su valoración general en EA FC 26 (orientativa, no oficial); las
//  estadísticas de penalti se derivan de ella. El juego no está afiliado a
//  ningún club, liga ni editor.
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
  ['Harry Kane', 'DC', 'Inglaterra', 89, 'P'],
  ['Robert Lewandowski', 'DC', 'Polonia', 85, 'P'],
  ['Cole Palmer', 'MCO', 'Inglaterra', 87, 'T'],
  ['Bruno Fernandes', 'MCO', 'Portugal', 86, 'T'],
  ['Cristiano Ronaldo', 'DC', 'Portugal', 85, 'F'],
  ['Kylian Mbappé', 'DC', 'Francia', 91, 'F'],
  ['Jorginho', 'MC', 'Italia', 79, 'P'],
  ['Mohamed Salah', 'ED', 'Egipto', 91, 'B'],
  ['Erling Haaland', 'DC', 'Noruega', 90, 'F'],
  ['Lionel Messi', 'ED', 'Argentina', 86, 'T'],
  // Oro
  ['Antoine Griezmann', 'SD', 'Francia', 84, 'T'],
  ['Ivan Toney', 'DC', 'Inglaterra', 80, 'P'],
  ['Gerard Moreno', 'DC', 'España', 79, 'P'],
  ['Mikel Oyarzabal', 'EI', 'España', 82, 'P'],
  ['Lautaro Martínez', 'DC', 'Argentina', 88, 'B'],
  ['Romelu Lukaku', 'DC', 'Bélgica', 82, 'F'],
  ['Ciro Immobile', 'DC', 'Italia', 78, 'B'],
  ['Iago Aspas', 'DC', 'España', 79, 'T'],
  ['Julián Álvarez', 'DC', 'Argentina', 86, 'B'],
  ['Alexander Isak', 'DC', 'Suecia', 86, 'B'],
  ['Jude Bellingham', 'MCO', 'Inglaterra', 88, 'B'],
  ['Bukayo Saka', 'ED', 'Inglaterra', 88, 'T'],
  ['Dušan Vlahović', 'DC', 'Serbia', 82, 'F'],
  ['Martin Ødegaard', 'MCO', 'Noruega', 87, 'T'],
  ['Son Heung-min', 'EI', 'Corea del Sur', 85, 'B'],
  ['Lamine Yamal', 'ED', 'España', 89, 'T'],
  ['Dani Parejo', 'MC', 'España', 79, 'P'],
  ['Victor Osimhen', 'DC', 'Nigeria', 86, 'F'],
  ['Vinícius Júnior', 'EI', 'Brasil', 89, 'F'],
  ['Álvaro Morata', 'DC', 'España', 80, 'B'],
  ['Ollie Watkins', 'DC', 'Inglaterra', 83, 'B'],
  // Plata
  ['Borja Iglesias', 'DC', 'España', 74, 'B'],
  ['Joselu', 'DC', 'España', 75, 'F'],
  ['Ante Budimir', 'DC', 'Croacia', 77, 'P'],
  ['Raúl de Tomás', 'DC', 'España', 70, 'T'],
  ['Alexander Sørloth', 'DC', 'Noruega', 81, 'F'],
  ['Ayoze Pérez', 'SD', 'España', 78, 'T'],
  ['Vedat Muriqi', 'DC', 'Kosovo', 75, 'F'],
  ['Iñaki Williams', 'DC', 'Ghana', 79, 'F'],
  ['Enes Ünal', 'DC', 'Turquía', 72, 'B'],
  ['Óscar Trejo', 'MCO', 'Argentina', 73, 'T'],
  ['Nico Williams', 'EI', 'España', 85, 'F'],
  ['Cyle Larin', 'DC', 'Canadá', 72, 'B'],
  // Bronce
  ['Lucas Pérez', 'DC', 'España', 70, 'T'],
  ['Cristhian Stuani', 'DC', 'Uruguay', 72, 'P'],
  ['Rubén Castro', 'DC', 'España', 62, 'B'],
  ['Aritz Aduriz', 'DC', 'España', 64, 'F'],
  ['Raúl García', 'MCO', 'España', 68, 'B'],
  ['Rafa Mir', 'DC', 'España', 70, 'F'],
  ['Hugo Duro', 'DC', 'España', 74, 'B'],
  ['Kike García', 'DC', 'España', 73, 'F'],
  ['Jorge Molina', 'DC', 'España', 62, 'P'],
  ['Sergi Enrich', 'DC', 'España', 63, 'F'],
  // Nuevos: todas las posiciones
  // Defensas centrales
  ['Virgil van Dijk', 'DFC', 'Países Bajos', 89, 'F'],
  ['William Saliba', 'DFC', 'Francia', 87, 'B'],
  ['Rúben Dias', 'DFC', 'Portugal', 88, 'B'],
  ['Antonio Rüdiger', 'DFC', 'Alemania', 86, 'F'],
  ['Marquinhos', 'DFC', 'Brasil', 86, 'P'],
  ['Alessandro Bastoni', 'DFC', 'Italia', 86, 'T'],
  ['Gabriel Magalhães', 'DFC', 'Brasil', 87, 'F'],
  ['Joško Gvardiol', 'DFC', 'Croacia', 86, 'F'],
  ['Pau Cubarsí', 'DFC', 'España', 84, 'B'],
  ['Dean Huijsen', 'DFC', 'España', 83, 'B'],
  ['Éder Militão', 'DFC', 'Brasil', 84, 'F'],
  ['Kim Min-jae', 'DFC', 'Corea del Sur', 84, 'F'],
  ['Ronald Araújo', 'DFC', 'Uruguay', 84, 'F'],
  // Laterales derechos
  ['Achraf Hakimi', 'LD', 'Marruecos', 89, 'T'],
  ['Trent Alexander-Arnold', 'LD', 'Inglaterra', 86, 'T'],
  ['Jules Koundé', 'LD', 'Francia', 86, 'B'],
  ['Pedro Porro', 'LD', 'España', 84, 'T'],
  ['Jeremie Frimpong', 'LD', 'Países Bajos', 84, 'B'],
  ['Dani Carvajal', 'LD', 'España', 85, 'P'],
  // Laterales izquierdos
  ['Nuno Mendes', 'LI', 'Portugal', 87, 'B'],
  ['Alphonso Davies', 'LI', 'Canadá', 84, 'F'],
  ['Theo Hernández', 'LI', 'Francia', 85, 'F'],
  ['Alejandro Grimaldo', 'LI', 'España', 86, 'T'],
  ['Alejandro Balde', 'LI', 'España', 83, 'B'],
  ['Federico Dimarco', 'LI', 'Italia', 86, 'T'],
  ['Marc Cucurella', 'LI', 'España', 84, 'B'],
  // Mediocentros defensivos
  ['Rodri', 'MCD', 'España', 90, 'P'],
  ['Declan Rice', 'MCD', 'Inglaterra', 87, 'F'],
  ['Joshua Kimmich', 'MCD', 'Alemania', 89, 'P'],
  ['Martín Zubimendi', 'MCD', 'España', 86, 'P'],
  ['Aurélien Tchouaméni', 'MCD', 'Francia', 85, 'F'],
  ['Moisés Caicedo', 'MCD', 'Ecuador', 86, 'B'],
  ['Bruno Guimarães', 'MCD', 'Brasil', 85, 'T'],
  // Centrocampistas
  ['Pedri', 'MC', 'España', 89, 'T'],
  ['Federico Valverde', 'MC', 'Uruguay', 89, 'F'],
  ['Vitinha', 'MC', 'Portugal', 89, 'P'],
  ['Frenkie de Jong', 'MC', 'Países Bajos', 87, 'T'],
  ['Nicolò Barella', 'MC', 'Italia', 86, 'B'],
  ['Fabián Ruiz', 'MC', 'España', 86, 'P'],
  ['Alexis Mac Allister', 'MC', 'Argentina', 87, 'P'],
  ['Luka Modrić', 'MC', 'Croacia', 84, 'T'],
  // Mediapuntas
  ['Kevin De Bruyne', 'MCO', 'Bélgica', 88, 'T'],
  ['Jamal Musiala', 'MCO', 'Alemania', 88, 'T'],
  ['Florian Wirtz', 'MCO', 'Alemania', 89, 'T'],
  ['Dani Olmo', 'MCO', 'España', 84, 'P'],
  ['Arda Güler', 'MCO', 'Turquía', 84, 'T'],
  // Extremos y delanteros
  ['Raphinha', 'EI', 'Brasil', 89, 'F'],
  ['Ousmane Dembélé', 'ED', 'Francia', 90, 'B'],
  ['Khvicha Kvaratskhelia', 'EI', 'Georgia', 88, 'T'],
  ['Michael Olise', 'ED', 'Francia', 88, 'T'],
  ['Rodrygo', 'ED', 'Brasil', 85, 'B'],
  ['Phil Foden', 'ED', 'Inglaterra', 86, 'T'],
  ['Rafael Leão', 'EI', 'Portugal', 85, 'F'],
  ['Désiré Doué', 'ED', 'Francia', 85, 'B'],
  ['Viktor Gyökeres', 'DC', 'Suecia', 86, 'F'],
  ['Ferran Torres', 'DC', 'España', 83, 'P'],
];

// Perfiles de portero: R = reflejos, S = parador, A = ágil (gran reincorporación)
const KEEPERS = [
  // Élite
  ['Emiliano Martínez', 'POR', 'Argentina', 87, 'R'],
  ['Thibaut Courtois', 'POR', 'Bélgica', 89, 'S'],
  ['Diogo Costa', 'POR', 'Portugal', 86, 'A'],
  ['Alisson Becker', 'POR', 'Brasil', 89, 'S'],
  ['Yassine Bounou', 'POR', 'Marruecos', 84, 'R'],
  ['Jan Oblak', 'POR', 'Eslovenia', 88, 'S'],
  ['Mike Maignan', 'POR', 'Francia', 87, 'A'],
  ['Gianluigi Donnarumma', 'POR', 'Italia', 89, 'R'],
  ['Marc-André ter Stegen', 'POR', 'Alemania', 85, 'A'],
  ['Unai Simón', 'POR', 'España', 84, 'R'],
  // Oro
  ['Dominik Livaković', 'POR', 'Croacia', 79, 'R'],
  ['David Raya', 'POR', 'España', 86, 'A'],
  ['Gregor Kobel', 'POR', 'Suiza', 86, 'S'],
  ['Giorgi Mamardashvili', 'POR', 'Georgia', 82, 'R'],
  ['Ederson', 'POR', 'Brasil', 85, 'A'],
  ['Wojciech Szczęsny', 'POR', 'Polonia', 83, 'S'],
  ['Álex Remiro', 'POR', 'España', 83, 'S'],
  ['Jordan Pickford', 'POR', 'Inglaterra', 82, 'R'],
  ['Yann Sommer', 'POR', 'Suiza', 84, 'A'],
  ['Andriy Lunin', 'POR', 'Ucrania', 79, 'R'],
  ['André Onana', 'POR', 'Camerún', 82, 'A'],
  ['Bart Verbruggen', 'POR', 'Países Bajos', 82, 'R'],
  ['Kepa Arrizabalaga', 'POR', 'España', 80, 'R'],
  // Plata
  ['Joan García', 'POR', 'España', 82, 'A'],
  ['David Soria', 'POR', 'España', 79, 'S'],
  ['Rui Silva', 'POR', 'Portugal', 78, 'R'],
  ['Aitor Fernández', 'POR', 'España', 74, 'S'],
  ['Stole Dimitrievski', 'POR', 'Macedonia del Norte', 76, 'R'],
  ['Paulo Gazzaniga', 'POR', 'Argentina', 76, 'A'],
  ['Sergio Herrera', 'POR', 'España', 76, 'S'],
  ['Fernando Pacheco', 'POR', 'España', 72, 'A'],
  ['Rubén Blanco', 'POR', 'España', 72, 'R'],
  ['Diego Mariño', 'POR', 'España', 70, 'A'],
  // Bronce
  ['Matías Dituro', 'POR', 'Argentina', 74, 'S'],
  ['Andrés Fernández', 'POR', 'España', 72, 'R'],
  ['Edgar Badía', 'POR', 'España', 64, 'A'],
  ['Dani Martín', 'POR', 'España', 72, 'S'],
  ['Iván Villar', 'POR', 'España', 64, 'A'],
  ['Álvaro Ratón', 'POR', 'España', 63, 'R'],
  // Nuevos
  ['Manuel Neuer', 'POR', 'Alemania', 87, 'R'],
  ['Guglielmo Vicario', 'POR', 'Italia', 84, 'R'],
  ['Lucas Chevalier', 'POR', 'Francia', 84, 'A'],
  ['Robert Sánchez', 'POR', 'España', 83, 'S'],
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
  // GOAT: 4 lanzadores y 4 porteros con todo a 99 (muy difíciles de conseguir)
  ['Lionel Messi', 'goat', 'max'],
  ['Cristiano Ronaldo', 'goat', 'max'],
  ['Kylian Mbappé', 'goat', 'max'],
  ['Erling Haaland', 'goat', 'max'],
  ['Thibaut Courtois', 'goat', 'max'],
  ['Alisson Becker', 'goat', 'max'],
  ['Gianluigi Donnarumma', 'goat', 'max'],
  ['Emiliano Martínez', 'goat', 'max'],
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
  const rating = base; // media tipo FIFA; las estadísticas giran alrededor de ella
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

// Cartas personalizadas: GOAT con todas las estadísticas a 99. [nombre, posición, nacionalidad, perfil]
const CUSTOM = [
  ['Martinet', 'DC', 'España', 'B'],
];
const custom = CUSTOM.map(([name, position, nation, profile]) => {
  const c = buildCard([name, position, nation, 99, profile], position === 'POR' ? 'portero' : 'jugador');
  for (const k of Object.keys(c.stats)) c.stats[k] = 99;
  return { ...c, id: `goat-${c.id}`, tier: 'goat', special: true };
});

export const CARDS = [...base, ...specials, ...icons, ...custom];
export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function cardsOf(type, tier) {
  return CARDS.filter((c) => c.type === type && c.tier === tier);
}

// Comprobación de integridad: cada categoría debe tener jugadores y porteros.
for (const t of ['bronce', 'plata', 'oro', 'elite', 'toty', 'futties', 'icono', 'goat']) {
  for (const type of ['jugador', 'portero']) {
    if (!cardsOf(type, t).length) throw new Error(`Falta ${type} en categoría ${t}`);
  }
}
