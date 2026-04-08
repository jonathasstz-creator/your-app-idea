/**
 * Anti-regression: HUD Streak/Combo display
 * Streak must display predictably and not flicker.
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

describe('HUD Streak/Combo', () => {
  let ui: UIService;

  beforeEach(() => {
    setupDOM();
    ui = new UIService();
  });

  it('should display streak when provided', () => {
    ui.updateHud({ step: 1, total: 10, status: 'HIT', scoreTotal: 10, streak: 3 });
    const el = document.getElementById('hud-streak')!;
    expect(el.style.display).toBe('block');
    expect(el.textContent).toBe('x3');
  });

  it('should show streak=0 as visible (not hidden)', () => {
    ui.updateHud({ step: 0, total: 10, status: 'RESET', scoreTotal: 0, streak: 0 });
    const el = document.getElementById('hud-streak')!;
    expect(el.style.display).toBe('block');
  });

  it('should update streak value on step advance', () => {
    ui.updateHud({ step: 1, total: 10, status: 'HIT', scoreTotal: 10, streak: 1 });
    ui.updateHud({ step: 2, total: 10, status: 'HIT', scoreTotal: 20, streak: 2 });
    const el = document.getElementById('hud-streak')!;
    expect(el.textContent).toBe('x2');
  });

  it('streak should reset to 0 on MISS without hiding', () => {
    ui.updateHud({ step: 1, total: 10, status: 'HIT', scoreTotal: 10, streak: 3 });
    ui.updateHud({ step: 2, total: 10, status: 'MISS', scoreTotal: 10, streak: 0 });
    const el = document.getElementById('hud-streak')!;
    expect(el.style.display).toBe('block');
    expect(el.textContent).toBe('x0');
  });

  it('streak should NOT disappear when updateHud omits streak after being shown', () => {
    ui.updateHud({ step: 1, total: 10, status: 'HIT', scoreTotal: 10, streak: 5 });
    // Omit streak (e.g. FINISHED without streak field)
    ui.updateHud({ step: 9, total: 10, status: 'FINISHED' });
    const el = document.getElementById('hud-streak')!;
    expect(el.style.display).toBe('block');
    expect(el.textContent).toContain('5');
  });
});
