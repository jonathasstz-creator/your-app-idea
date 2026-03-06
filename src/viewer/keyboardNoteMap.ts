export type DebugInputSource = "midi" | "mouse" | "keyboard";

type KeyMapping = {
  key: string;
  midi: number;
  label: string;
};

/**
 * Cromático C4 -> C5 (13 notas) usando duas fileiras do teclado físico.
 * Layout:
 *   C4  C#4 D4  D#4 E4  F4  F#4 G4  G#4 A4  A#4 B4  C5
 *   A   W   S   E   D   F   T   G   Y   H   U   J   K
 */
const KEYBOARD_MAP: KeyMapping[] = [
  { key: "a", midi: 60, label: "A" },  // C4
  { key: "w", midi: 61, label: "W" },  // C#4
  { key: "s", midi: 62, label: "S" },  // D4
  { key: "e", midi: 63, label: "E" },  // D#4
  { key: "d", midi: 64, label: "D" },  // E4
  { key: "f", midi: 65, label: "F" },  // F4
  { key: "t", midi: 66, label: "T" },  // F#4
  { key: "g", midi: 67, label: "G" },  // G4
  { key: "y", midi: 68, label: "Y" },  // G#4
  { key: "h", midi: 69, label: "H" },  // A4
  { key: "u", midi: 70, label: "U" },  // A#4
  { key: "j", midi: 71, label: "J" },  // B4
  { key: "k", midi: 72, label: "K" },  // C5
];

export const KEY_TO_MIDI: Record<string, number> = {};
export const MIDI_TO_KEY_LABEL: Record<number, string> = {};

KEYBOARD_MAP.forEach(({ key, midi, label }) => {
  KEY_TO_MIDI[key] = midi;
  MIDI_TO_KEY_LABEL[midi] = label;
});

export const DEBUG_NOTE_RANGE = {
  min: 60, // C4
  max: 72, // C5
};

export const KEYBOARD_SEQUENCE = KEYBOARD_MAP;
