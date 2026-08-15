import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  App,
  bindAppPopState,
  planHistorySync,
  scheduleYachtOpeningTransition,
  YACHT_OPENING_FADE_MS,
  YACHT_OPENING_RESULT_MS,
} from './App';
import {
  nextYachtSheetOpen,
  showYachtSelfMarker,
  YACHT_SCORE_ROWS,
  yachtDieSelection,
} from './components/YachtGame';
import { createYachtTurn, reduceYachtTurn } from './game/yacht';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

class PopHistory {
  constructor(routes) {
    this.states = routes.map((route) => ({ nollawa: 'route-v1', route }));
    this.index = this.states.length - 1;
    this.exits = 0;
    this.listener = null;
    this.history = {
      replaceState: (state) => { this.states[this.index] = state; },
    };
  }
  addEventListener(type, listener) { if (type === 'popstate') this.listener = listener; }
  removeEventListener(type, listener) { if (type === 'popstate' && this.listener === listener) this.listener = null; }
  back() {
    if (this.index === 0) { this.exits += 1; return; }
    this.index -= 1;
    this.listener?.({ state: this.states[this.index] });
  }
}

function runBackSequence(mode, routes) {
  const target = new PopHistory(routes);
  let route = routes.at(-1), skip = null;
  const screens = [], commands = [];
  const unbind = bindAppPopState(
    target,
    () => ({ route, mode, skip }),
    () => { skip = null; },
    (transition) => {
      route = transition.route;
      screens.push(transition.screen);
      if (transition.command) commands.push(transition.command.command);
    },
  );
  for (let index = 1; index < routes.length; index += 1) target.back();
  unbind();
  return { target, route, screens, commands };
}

describe('M2-YACHT-3 eight-item acceptance', () => {
  it('M2-YACHT-3-1-ROLLED-DICE-DEFAULT-UNTIL-USER-SELECTION: rolled dice stay unraised until the user selects one', () => {
    const rolled = reduceYachtTurn(createYachtTurn(), { type: 'roll', dice: [1, 2, 3, 4, 5] });
    expect(yachtDieSelection(rolled.held)).toEqual([false, false, false, false, false]);
    const selected = reduceYachtTurn(rolled, { type: 'toggle-hold', index: 2 });
    expect(yachtDieSelection(selected.held)).toEqual([false, false, true, false, false]);
  });

  it('M2-YACHT-3-2-EXACT-120MS-SELECTION-TRANSFORM: changes only duration and preserves lift rotation and spring', () => {
    expect(css).toMatch(/\.yacht-die-button \{[^}]*transition:\s*transform 120ms cubic-bezier\(\.2, 1\.4, \.4, 1\)/);
    expect(css).toMatch(/\.yacht-die-button\.reroll-selected \{[^}]*transform:\s*translateY\(-70%\) rotate\(15deg\)/);
    expect(css.match(/\.yacht-die-button\.reroll-selected \{[^}]*\}/)?.[0]).not.toMatch(/transition/);
  });

  it('M2-YACHT-3-3-SELF-MARKER-REMOTE-ONLY: local hides 나 and remote retains it for the viewer column', () => {
    expect(showYachtSelfMarker(true, 'one', 'one')).toBe(false);
    expect(showYachtSelfMarker(false, 'one', 'one')).toBe(true);
    expect(showYachtSelfMarker(false, 'one', 'two')).toBe(false);
  });

  it('M2-YACHT-3-4-ORDER-RESULT-4000MS-THEN-FADE: keeps the result readable for four seconds before a visible fade and gameplay', () => {
    vi.useFakeTimers();
    try {
      const phases = ['result'];
      let timer = null;
      scheduleYachtOpeningTransition(
        (task, delay) => Number(setTimeout(task, delay)),
        (next) => { timer = next; },
        () => phases.push('fade'),
        () => phases.push('game'),
      );
      vi.advanceTimersByTime(YACHT_OPENING_RESULT_MS - 1);
      expect(phases).toEqual(['result']);
      vi.advanceTimersByTime(1);
      expect(phases).toEqual(['result', 'fade']);
      expect(css).toMatch(/\.opening-result \{[^}]*transition:\s*opacity 300ms/);
      expect(css).toMatch(/\.opening-result\.opening-fade \{[^}]*opacity:\s*0/);
      vi.advanceTimersByTime(YACHT_OPENING_FADE_MS - 1);
      expect(phases).toEqual(['result', 'fade']);
      vi.advanceTimersByTime(1);
      expect(phases).toEqual(['result', 'fade', 'game']);
      expect(timer).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('M2-YACHT-3-5-BONUS-BETWEEN-SIXES-AND-CHOICE: renders the upper bonus row in the required score order', () => {
    const sixes = YACHT_SCORE_ROWS.indexOf('sixes');
    expect(YACHT_SCORE_ROWS.slice(sixes, sixes + 3)).toEqual(['sixes', 'upper-bonus', 'choice']);
  });

  it('M2-YACHT-3-6-SHEET-OPENING-STATE-MACHINE: rolling preserves manual choice, a new turn closes stale state, and rolling completion forces open', () => {
    const manuallyOpened = nextYachtSheetOpen(false, 'manual-toggle');
    expect(manuallyOpened).toBe(true);
    expect(nextYachtSheetOpen(manuallyOpened, 'rolling-continues')).toBe(true);
    expect(nextYachtSheetOpen(manuallyOpened, 'new-rolling-turn')).toBe(false);
    expect(nextYachtSheetOpen(false, 'rolling-ended')).toBe(true);
    expect(nextYachtSheetOpen(true, 'browser-back')).toBe(false);
  });

  it('M2-YACHT-3-7-BEHAVIORAL-POPSTATE-ROUTES: score sheet is one entry and remote/local back sequences never default-exit', () => {
    expect(planHistorySync('yacht', 'yacht-sheet', 'remote')).toEqual({ type: 'push', routes: ['yacht-sheet'] });
    expect(planHistorySync('yacht', 'yacht-sheet', 'local')).toEqual({ type: 'push', routes: ['yacht-sheet'] });
    const remote = runBackSequence('remote', ['name', 'lobby', 'yacht', 'yacht-sheet']);
    expect(remote).toMatchObject({ route: 'name', screens: ['yacht', 'lobby', 'name'], commands: ['return-lobby', 'leave-room'] });
    expect(remote.target.exits).toBe(0);
    const local = runBackSequence('local', ['name', 'games', 'yacht', 'yacht-sheet']);
    expect(local).toMatchObject({ route: 'name', screens: ['yacht', 'games', 'name'], commands: [] });
    expect(local.target.exits).toBe(0);
    expect(remote.target.listener).toBeNull();
    expect(local.target.listener).toBeNull();
  });

  it('M2-YACHT-3-8-EXACT-TITLE-SUBTITLE: title eyebrow is exactly 친구와 즐기는 파티게임', () => {
    expect(App.toString()).toContain('친구와 즐기는 파티게임');
    expect(App.toString()).not.toContain('네 줄을 먼저 이어 보세요');
  });
});
