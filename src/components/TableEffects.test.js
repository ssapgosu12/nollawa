import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { voteTimerPresentation } from '../App';
import { samok } from '../game/samok';
import { Countdown, Vignette } from './TableEffects';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const voteState = (effectsSuppressed = false) => ({
  ...samok.init(),
  vote: { turn: 1, voters: [{ id: 'p1', team: 1, column: 2 }], deadline: 10_000, effectsSuppressed },
});

describe('V2: authoritative absolute deadline presentation', () => {
  it('whole seconds drive hidden-above-5, 1000ms, then 250ms presentation and the fixed 1-second case stays hidden', () => {
    expect(voteTimerPresentation(voteState(), 4_000)).toMatchObject({ remaining: 6, visible: false, periodMs: 1_000 });
    expect(voteTimerPresentation(voteState(), 5_000)).toMatchObject({ remaining: 5, visible: true, periodMs: 1_000 });
    expect(voteTimerPresentation(voteState(), 7_000)).toMatchObject({ remaining: 3, visible: true, periodMs: 250 });
    expect(voteTimerPresentation(voteState(true), 9_000)).toEqual({ remaining: 0, visible: false, intensity: 0, periodMs: 1_000 });
  });
});

describe('E6: reusable vignette', () => {
  it('accepts intensity and period, paints only viewport edges, and reduced motion fixes a faint edge', () => {
    const vnode = Vignette({ intensity: .12, periodMs: 250 });
    expect(vnode.props).toMatchObject({ class: 'viewport-vignette', 'aria-hidden': 'true' });
    expect(vnode.props.style).toContain('--vignette-intensity:0.12');
    expect(vnode.props.style).toContain('--vignette-period:250ms');
    expect(css).toMatch(/\.viewport-vignette\s*{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*radial-gradient/s);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.viewport-vignette\s*{[^}]*animation:\s*none[^}]*opacity:\s*\.3/);
  });
});

describe('E7: reusable countdown', () => {
  it('accepts remaining and visibility, renders only when requested, and is fixed at the viewport bottom', () => {
    expect(Countdown({ remaining: 5, visible: false })).toBeNull();
    const vnode = Countdown({ remaining: 3, visible: true });
    expect(vnode?.props).toMatchObject({ class: 'viewport-countdown', children: 3 });
    expect(css).toMatch(/\.viewport-countdown\s*{[^}]*position:\s*fixed[^}]*bottom:\s*max\(\.2rem,\s*env\(safe-area-inset-bottom\)\)/s);
  });
});
