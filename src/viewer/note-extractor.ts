
import { toNum, noteNameToMidi, isNumber, normalizeBeat } from './utils';

export function extractMidiAny(note: any): number {
  const candidates = [
    note?.midi, note?.expected_pitch, note?.expectedPitch,
    note?.expected_midi, note?.target_midi, note?.note_midi,
    note?.pitch, note?.note, note?.expected?.midi,
    note?.expected?.pitch, note?.target?.midi, note?.target?.pitch,
  ];
  for (const c of candidates) {
    if (typeof c === "string") {
      const byName = noteNameToMidi(c);
      if (isNumber(byName)) return byName;
    }
    const n = toNum(c);
    if (isNumber(n)) return n;
  }
  return NaN;
}

export function extractStepAny(note: any): number {
  const candidates = [
    note?.step_index, note?.stepIndex, note?.step,
    note?.index, note?.i, note?.position, note?.seq,
  ];
  for (const c of candidates) {
    const n = toNum(c);
    if (isNumber(n)) return Math.floor(n);
  }
  return NaN;
}

export function extractMidiFromOsmdNote(note: any): number | null {
  if (!note) return null;
  const sourceNote = note.SourceNote ?? note.sourceNote;
  if (sourceNote?.Pitch) {
    const fund = sourceNote.Pitch.fundamentalNote ?? sourceNote.Pitch.FundamentalNote;
    const acc = sourceNote.Pitch.accidental ?? sourceNote.Pitch.Accidental ?? 0;
    const oct = sourceNote.Pitch.octave ?? sourceNote.Pitch.Octave;
    if (isNumber(fund) && isNumber(oct)) return (oct + 1) * 12 + fund + acc;
  }
  if (note.Pitch) {
    const fund = note.Pitch.fundamentalNote ?? note.Pitch.FundamentalNote;
    const acc = note.Pitch.accidental ?? note.Pitch.Accidental ?? 0;
    const oct = note.Pitch.octave ?? note.Pitch.Octave;
    if (isNumber(fund) && isNumber(oct)) return (oct + 1) * 12 + fund + acc;
  }
  return null;
}

export function isRestNote(note: any): boolean {
  return Boolean(note?.isRest ?? note?.IsRest ?? note?.sourceNote?.isRest ?? note?.SourceNote?.isRest);
}

export function normalizeStaffName(value: any): string | null {
  if (typeof value !== "string") return null;
  const s = value.toLowerCase();
  if (s.includes("treble") || s.includes("right")) return "treble";
  if (s.includes("bass") || s.includes("left")) return "bass";
  return null;
}

export function extractStaffFromEntry(staffEntry: any, iterator?: any): string | null {
  if (!staffEntry) return null;
  const staff = staffEntry.ParentStaff ?? staffEntry.Staff ?? null;
  const name = normalizeStaffName(staff?.Name ?? staff?.name);
  if (name) return name;
  const id = toNum(staff?.Id ?? staff?.id ?? staffEntry?.StaffId ?? iterator?.CurrentStaffNumber);
  if (id === 2) return "bass";
  return "treble";
}

export function extractMeasureIndex(staffEntry: any, iterator: any): number {
  const measure = staffEntry?.ParentMeasure ?? staffEntry?.Measure ?? null;
  const raw = measure?.MeasureNumber ?? measure?.MeasureNumberReal ?? iterator?.CurrentMeasureIndex;
  const n = toNum(raw);
  return isNumber(n) ? (n >= 1 ? Math.floor(n - 1) : Math.floor(n)) : 0;
}

export function extractBeatIndex(staffEntry: any): number {
  const ts = staffEntry?.Timestamp ?? staffEntry?.timestamp;
  const raw = ts?.RealValue ?? ts?.realValue ?? 0;
  return normalizeBeat(raw) || 0;
}
