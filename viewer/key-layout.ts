
/**
 * KeyLayout - Single Source of Truth for Piano Keyboard Geometry
 * 
 * This module provides deterministic key positioning for both the physical
 * keyboard rendering and falling notes alignment (MIDIano pattern).
 * 
 * All MIDI-to-position calculations use this module as the sole source of truth.
 */

import { MIDI_MIN, MIDI_MAX, TOTAL_WHITE_KEYS } from './constants';

export interface KeyRect {
  midi: number;
  isBlack: boolean;
  x: number;
  w: number;
  centerX: number;
}

/**
 * Determines if a MIDI note is a black key based on pitch class.
 */
function isBlackKey(midi: number): boolean {
  const n = midi % 12;
  return [1, 3, 6, 8, 10].includes(n);
}

/**
 * Calculates the exact physical layout of an 88-key piano (A0-C8).
 * 
 * Geometry rules:
 * - White keys: uniform width
 * - Black keys: ~0.65x white key width, positioned between white keys
 * - Black keys only on pitch classes {1,3,6,8,10} (C#, D#, F#, G#, A#)
 * 
 * @param width Total width in pixels for the keyboard
 * @returns Map of MIDI note → KeyRect (position and dimensions)
 */
export function calculateKeyLayout(width: number): Map<number, KeyRect> {
  const layout = new Map<number, KeyRect>();
  const whiteKeyWidth = width / TOTAL_WHITE_KEYS;
  const blackKeyWidth = whiteKeyWidth * 0.65;
  
  let whiteIndex = 0;
  
  // Iterate through all MIDI notes in range
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
    const isBlack = isBlackKey(midi);
    
    if (!isBlack) {
      // White key: occupies full whiteKeyWidth
      const x = whiteIndex * whiteKeyWidth;
      layout.set(midi, {
        midi,
        isBlack: false,
        x: x,
        w: whiteKeyWidth,
        centerX: x + whiteKeyWidth / 2
      });
      whiteIndex++;
    } else {
      // Black key: positioned at center of gap between white keys
      const x = (whiteIndex * whiteKeyWidth) - (blackKeyWidth / 2);
      layout.set(midi, {
        midi,
        isBlack: true,
        x: x,
        w: blackKeyWidth,
        centerX: x + blackKeyWidth / 2
      });
    }
  }
  
  return layout;
}

/**
 * Gets the KeyRect for a given MIDI note.
 * 
 * @param layout The key layout map
 * @param midi MIDI note number
 * @returns KeyRect if found, undefined otherwise
 */
export function getKeyRect(layout: Map<number, KeyRect>, midi: number): KeyRect | undefined {
  return layout.get(midi);
}
