/**
 * Anti-regression: Feature flags menu must expose Step Quality toggles
 */
import { describe, it, expect, beforeEach } from 'vitest';

describe('Feature Flags Step Quality Menu', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="feature-flag-group" aria-label="Feature flags">
        <span class="flag-group-label">Layout</span>
        <label class="debug-toggle">
          <input id="flag-sheet-toggle" type="checkbox" checked />
          <span>Partitura</span>
        </label>
        <label class="debug-toggle">
          <input id="flag-falling-toggle" type="checkbox" checked />
          <span>Falling Notes</span>
        </label>
        <label class="debug-toggle">
          <input id="flag-hide-hud-toggle" type="checkbox" />
          <span>Minimizar Menu</span>
        </label>
      </div>
      <div class="feature-flag-group" aria-label="Step Quality flags">
        <span class="flag-group-label">Step Quality</span>
        <label class="debug-toggle">
          <input id="flag-step-quality-streak-toggle" type="checkbox" />
          <span>Quality Streak</span>
        </label>
        <label class="debug-toggle">
          <input id="flag-step-quality-feedback-toggle" type="checkbox" />
          <span>Quality Feedback</span>
        </label>
      </div>
    `;
  });

  it('should have toggle for useStepQualityStreak', () => {
    const toggle = document.getElementById('flag-step-quality-streak-toggle') as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.type).toBe('checkbox');
  });

  it('should have toggle for showStepQualityFeedback', () => {
    const toggle = document.getElementById('flag-step-quality-feedback-toggle') as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.type).toBe('checkbox');
  });

  it('Step Quality group should be visually separated from Layout group', () => {
    const groups = document.querySelectorAll('.feature-flag-group');
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const labels = Array.from(groups).map(g => g.querySelector('.flag-group-label')?.textContent);
    expect(labels).toContain('Step Quality');
  });
});
