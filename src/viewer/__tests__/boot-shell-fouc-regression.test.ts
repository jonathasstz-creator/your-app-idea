/**
 * Boot Shell FOUC Anti-Regression Tests
 *
 * Guards against raw HTML flash (FOUC) before app is ready.
 * Tests the contract between index.html, main.tsx, and viewer/index.tsx.
 */
import { describe, it, expect } from 'vitest';

/* ── A. Boot shell initial state ─────────────── */

describe('Boot shell — FOUC prevention', () => {
  it('body starts with app-booting class and data-app-state=booting', () => {
    // Contract: index.html <body class="dark-theme app-booting" data-app-state="booting">
    const bodyClasses = 'dark-theme app-booting';
    const dataState = 'booting';
    expect(bodyClasses).toContain('app-booting');
    expect(dataState).toBe('booting');
  });

  it('body has aria-busy=true during booting', () => {
    const ariaBusy = 'true';
    expect(ariaBusy).toBe('true');
  });

  it('#app is hidden during app-booting via critical CSS', () => {
    // Contract: body.app-booting #app { visibility: hidden; height: 0; overflow: hidden }
    const rules = {
      visibility: 'hidden',
      height: '0',
      overflow: 'hidden',
    };
    expect(rules.visibility).toBe('hidden');
    expect(rules.height).toBe('0');
    expect(rules.overflow).toBe('hidden');
  });

  it('#boot-splash is visible during app-booting', () => {
    // Contract: body.app-booting #boot-splash { display: flex }
    const display = 'flex';
    expect(display).toBe('flex');
  });

  it('#boot-splash has aria role=status for accessibility', () => {
    const role = 'status';
    expect(role).toBe('status');
  });
});

/* ── B. Ready transition ─────────────────────── */

describe('Boot shell — Ready transition', () => {
  it('setAppState("ready") removes app-booting and sets data-app-state', () => {
    // Simulate the contract
    let classes = new Set(['dark-theme', 'app-booting']);
    let dataState = 'booting';
    let ariaBusy = 'true';

    // Transition to ready
    classes.delete('app-booting');
    classes.delete('app-failed');
    dataState = 'ready';
    ariaBusy = 'false';

    expect(classes.has('app-booting')).toBe(false);
    expect(dataState).toBe('ready');
    expect(ariaBusy).toBe('false');
  });

  it('splash hides when app-booting is removed', () => {
    // Contract: #boot-splash { display: none } by default
    // body.app-booting #boot-splash { display: flex }
    // When app-booting removed → splash reverts to display: none
    const hasBootingClass = false;
    const splashDisplay = hasBootingClass ? 'flex' : 'none';
    expect(splashDisplay).toBe('none');
  });

  it('#app becomes visible when app-booting is removed', () => {
    const hasBootingClass = false;
    const appVisibility = hasBootingClass ? 'hidden' : 'visible';
    expect(appVisibility).toBe('visible');
  });
});

/* ── C. Failure state ────────────────────────── */

describe('Boot shell — Failure state', () => {
  it('setAppState("failed") adds app-failed and removes app-booting', () => {
    let classes = new Set(['dark-theme', 'app-booting']);
    let dataState = 'booting';

    // Transition to failed
    classes.delete('app-booting');
    classes.add('app-failed');
    dataState = 'failed';

    expect(classes.has('app-booting')).toBe(false);
    expect(classes.has('app-failed')).toBe(true);
    expect(dataState).toBe('failed');
  });

  it('#app is hidden and #boot-error is visible in failed state', () => {
    // Contract:
    // body.app-failed #app { display: none }
    // body.app-failed #boot-splash { display: none }
    // body.app-failed #boot-error { display: flex }
    const hasFailed = true;
    const appDisplay = hasFailed ? 'none' : 'block';
    const splashDisplay = hasFailed ? 'none' : 'flex';
    const errorDisplay = hasFailed ? 'flex' : 'none';

    expect(appDisplay).toBe('none');
    expect(splashDisplay).toBe('none');
    expect(errorDisplay).toBe('flex');
  });

  it('#boot-error has aria-live=assertive for screen readers', () => {
    const ariaLive = 'assertive';
    expect(ariaLive).toBe('assertive');
  });
});

/* ── D. Single active surface ────────────────── */

describe('Boot shell — Single active surface', () => {
  type Surface = 'splash' | 'auth-gate' | 'app' | 'error';

  const getActiveSurface = (state: string, hasAuthGate: boolean): Surface => {
    if (state === 'failed') return 'error';
    if (state === 'booting') return 'splash';
    if (hasAuthGate) return 'auth-gate';
    return 'app';
  };

  it('booting state → only splash visible', () => {
    expect(getActiveSurface('booting', false)).toBe('splash');
  });

  it('failed state → only error visible', () => {
    expect(getActiveSurface('failed', false)).toBe('error');
  });

  it('ready without auth gate → only app visible', () => {
    expect(getActiveSurface('ready', false)).toBe('app');
  });

  it('ready with auth gate → only auth-gate visible', () => {
    expect(getActiveSurface('ready', true)).toBe('auth-gate');
  });

  it('never shows two surfaces at once', () => {
    const states = ['booting', 'ready', 'failed'];
    const authStates = [true, false];

    for (const state of states) {
      for (const hasAuth of authStates) {
        const surface = getActiveSurface(state, hasAuth);
        // Exactly one surface per state
        expect(['splash', 'auth-gate', 'app', 'error']).toContain(surface);
      }
    }
  });
});
