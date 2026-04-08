/**
 * Anti-regression: HUD Status priority
 * FINISHED must not be overwritten by transient states.
 * HIT/MISS should have minimum display duration.
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

describe('HUD Status Priority', () => {
  let ui: UIService;

  beforeEach(() => {
    setupDOM();
    ui = new UIService();
  });

  it('should display FINISHED as terminal status', () => {
    ui.updateHud({ step: 9, total: 10, status: 'FINISHED', scoreTotal: 100 });
    const el = document.getElementById('hud-status')!;
    expect(el.textContent).toBe('FINISHED');
  });

  it('FINISHED should NOT be overwritten by WAITING', () => {
    ui.updateHud({ step: 9, total: 10, status: 'FINISHED', scoreTotal: 100 });
    // Subsequent call tries to revert status
    ui.updateHud({ step: 9, total: 10, status: 'WAITING', scoreTotal: 100 });
    const el = document.getElementById('hud-status')!;
    expect(el.textContent).toBe('FINISHED');
  });

  it('FINISHED should NOT be overwritten by HIT', () => {
    ui.updateHud({ step: 9, total: 10, status: 'FINISHED', scoreTotal: 100 });
    ui.updateHud({ step: 9, total: 10, status: 'HIT', scoreTotal: 100 });
    const el = document.getElementById('hud-status')!;
    expect(el.textContent).toBe('FINISHED');
  });

  it('should show HIT status correctly', () => {
    ui.updateHud({ step: 3, total: 10, status: 'HIT', scoreTotal: 30 });
    const el = document.getElementById('hud-status')!;
    expect(el.textContent).toBe('HIT');
    expect(el.classList.contains('status-hit')).toBe(true);
  });

  it('should show MISS status with correct class', () => {
    ui.updateHud({ step: 3, total: 10, status: 'MISS', scoreTotal: 20 });
    const el = document.getElementById('hud-status')!;
    expect(el.textContent).toBe('MISS');
    expect(el.classList.contains('status-miss')).toBe(true);
  });

  it('should allow reset after FINISHED via explicit RESET', () => {
    ui.updateHud({ step: 9, total: 10, status: 'FINISHED', scoreTotal: 100 });
    ui.updateHud({ step: 0, total: 10, status: 'RESET', scoreTotal: 0 });
    const el = document.getElementById('hud-status')!;
    expect(el.textContent).toBe('RESET');
  });
});
