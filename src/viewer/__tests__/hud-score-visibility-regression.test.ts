/**
 * Anti-regression: HUD Score visibility
 * Score must remain visible even when updateHud is called without scoreTotal (e.g. FINISHED state).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { UIService } from '../ui-service';

function setupDOM() {
  document.body.innerHTML = `
    <div id="hud-step" class="value">--/--</div>
    <div id="hud-status" class="value">IDLE</div>
    <div id="hud-score" class="value" style="display: none;">0</div>
    <div id="hud-streak" class="value" style="display: none;">x0</div>
    <div id="judge-feedback">AGUARDANDO</div>
    <div id="hud-timer">00:00.00</div>
  `;
}

describe('HUD Score Visibility', () => {
  let ui: UIService;

  beforeEach(() => {
    setupDOM();
    ui = new UIService();
  });

  it('should show score when scoreTotal is provided', () => {
    ui.updateHud({ step: 0, total: 10, status: 'PLAYING', scoreTotal: 0 });
    const el = document.getElementById('hud-score')!;
    expect(el.style.display).toBe('block');
  });

  it('should NOT hide score when subsequent updateHud omits scoreTotal', () => {
    // First call sets score visible
    ui.updateHud({ step: 0, total: 10, status: 'PLAYING', scoreTotal: 50 });
    // Second call (e.g. FINISHED) omits scoreTotal
    ui.updateHud({ step: 9, total: 10, status: 'FINISHED' });
    const el = document.getElementById('hud-score')!;
    // Score should remain visible with last known value
    expect(el.style.display).toBe('block');
    expect(el.textContent).toContain('50');
  });

  it('should NOT hide streak when subsequent updateHud omits streak', () => {
    ui.updateHud({ step: 0, total: 10, status: 'PLAYING', scoreTotal: 50, streak: 5 });
    ui.updateHud({ step: 9, total: 10, status: 'FINISHED' });
    const el = document.getElementById('hud-streak')!;
    expect(el.style.display).toBe('block');
    expect(el.textContent).toContain('5');
  });

  it('should show score=0 without hiding', () => {
    ui.updateHud({ step: 0, total: 10, status: 'RESET', scoreTotal: 0, streak: 0 });
    const scoreEl = document.getElementById('hud-score')!;
    const streakEl = document.getElementById('hud-streak')!;
    expect(scoreEl.style.display).toBe('block');
    expect(streakEl.style.display).toBe('block');
  });
});
