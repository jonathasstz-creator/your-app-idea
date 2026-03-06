
/**
 * Utilitários gerais para processamento de dados e matemática.
 */

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const isNumber = (value: any): value is number => Number.isFinite(value);

export function toNum(v: any): number {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  if (typeof v === "object") {
    if ("midi" in v) return toNum(v.midi);
    if ("value" in v) return toNum(v.value);
    if ("note" in v) return toNum(v.note);
    if ("pitch" in v) return toNum(v.pitch);
  }
  return NaN;
}

export function noteNameToMidi(name: string): number {
  const s = name.trim().toUpperCase();
  const m = s.match(/^([A-G])([#B]?)(-?\d+)$/);
  if (!m) return NaN;
  const letter = m[1];
  const acc = m[2];
  const oct = Number(m[3]);
  if (!Number.isFinite(oct)) return NaN;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter as keyof typeof base];
  const alter = acc === "#" ? 1 : acc === "B" ? -1 : 0;
  return (oct + 1) * 12 + base + alter;
}

export function normalizeBeat(value: any): number | null {
  const n = toNum(value);
  // PRESERVAÇÃO: Precisão decimal crítica para matching de beats
  return isNumber(n) ? Math.round(n * 1000) / 1000 : null;
}

/**
 * Resizes a canvas to its CSS dimensions using high-DPI scaling.
 * Correctly handles buffer sizing (canvas.width) vs visual sizing (canvas.style.width).
 */
export function resizeCanvasToCssSize(canvas: HTMLCanvasElement, cssW: number, cssH: number) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(cssW));
  const h = Math.max(1, Math.floor(cssH));

  // Set visual size in CSS pixels
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  // Set internal buffer size in device pixels
  const nextW = Math.max(1, Math.floor(w * dpr));
  const nextH = Math.max(1, Math.floor(h * dpr));

  if (canvas.width !== nextW) canvas.width = nextW;
  if (canvas.height !== nextH) canvas.height = nextH;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    // Coordinate system reset to CSS pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
