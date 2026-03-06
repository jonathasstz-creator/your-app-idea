
export const MIDI_MIN = 21; // A0
export const MIDI_MAX = 108; // C8
export const TOTAL_WHITE_KEYS = 52;

export const COLORS = {
  HIT: "#00ff88",
  MISS: "#ff0055",
  PRIMARY_NEON: "#00f2ff",
  LATE: "#f39c12",
  DEFAULT: "#334155",
  PIANO_BG: "#05070a",
  WHITE_KEY: "#ffffff",
  BLACK_KEY: "#111111",
  KEY_HIGHLIGHT: "rgba(0, 242, 255, 0.4)",
  // MIDIano-style: Cor para notas ativas (quando usuário toca no MIDI)
  ACTIVE_NOTE: "rgba(0, 242, 255, 0.6)", // Cor destacada para notas tocadas (teclado virtual)
  ACTIVE_FALLING_NOTE: "rgba(255, 215, 0, 0.8)" // Cor destacada para falling notes quando tocadas
};

export const MOCK_LESSONS = [
  {
    id: 'ritual-precisao',
    title: 'Ritual de Precisão',
    key: 'C minor',
    bpm: 120,
    duration: '05:00',
    tags: ['Técnica', 'Precisão']
  },
  {
    id: 'capitulo-4-escalas-menores',
    title: 'Capítulo 4 · Escalas Menores',
    key: 'A minor',
    bpm: 95,
    duration: '07:30',
    tags: ['Leitura', 'Expressividade']
  }
];
