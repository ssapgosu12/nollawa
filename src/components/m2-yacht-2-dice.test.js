import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DiceResults } from './Effects';
import { deriveYachtDieReplayKeys } from './YachtGame';

const yachtSource = readFileSync(new URL('./YachtGame.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const flattenedChildren = (node) => node.props.children.flat(Infinity).filter(Boolean);

describe('M2-YACHT-2-DICE parent acceptance 1-4', () => {
  it('M2-YACHT-2-DICE-1-VISIBLE-DIE-BUTTONS: makes every visible Yacht die the accessible selection control and removes the old hold list', () => {
    const rendered = DiceResults({ outcomes: [1, 2, 3, 4, 5], replayKeys: [1, 1, 1, 1, 1], selected: [true, true, true, true, true], onSelect: vi.fn() });
    const buttons = flattenedChildren(rendered).filter((node) => node.props.class?.includes('yacht-die-button'));
    expect(buttons).toHaveLength(5);
    expect(buttons.every((button) => button.type === 'button' && button.props['aria-pressed'] === true && button.props['aria-label'].includes('다시 굴림 선택'))).toBe(true);
    expect(yachtSource).toMatch(/onSelect=\{\(index\) => onAction\(\{ type: 'toggle-hold', index \}\)\}/);
    expect(yachtSource).not.toMatch(/yacht-holds|번 \{die\} ·|남김/);
  });

  it('M2-YACHT-2-DICE-2-SELECTED-SPRING-TRANSFORM: moves selected reroll dice by their own width and rotates them on one reversible 70ms spring transition', () => {
    expect(css).toMatch(/\.yacht-die-button \{[^}]*transition:\s*transform 70ms cubic-bezier\(\.2, 1\.4, \.4, 1\)/);
    expect(css).toMatch(/\.yacht-die-button\.reroll-selected \{[^}]*transform:\s*translateY\(-70%\) rotate\(15deg\)/);
    expect(css.match(/\.yacht-die-button\.reroll-selected \{[^}]*\}/)?.[0]).not.toMatch(/transition/);
  });

  it('M2-YACHT-2-DICE-3-CANCEL-CONFIRM-LABELS: preserves the left cancel and right confirm actions under the required copy', () => {
    expect(yachtSource).toContain("current.rolls ? '다시 굴리기' : '굴리기'");
    expect(yachtSource).toContain("onClick={() => onAction({ type: 'stop' })}>확정!</button>");
    expect(yachtSource).not.toContain('그만 굴리기');
  });

  it('M2-YACHT-2-DICE-4-HELD-DIE-STABLE-REPLAY: changes replay identity only for selected reroll dice while the held die remains stable', () => {
    const events = [
      { type: 'start', participants: [{ id: 'one', name: '하나' }] },
      { type: 'input', actorId: 'one', action: { type: 'roll', dice: [1, 2, 3, 4, 5] } },
      { type: 'input', actorId: 'one', action: { type: 'toggle-hold', index: 0 } },
      { type: 'input', actorId: 'one', action: { type: 'roll', dice: [6, 6, 6, 6, 6] } },
    ];
    const identities = deriveYachtDieReplayKeys(events);
    expect(identities).toEqual([1, 3, 3, 3, 3]);
    const rendered = DiceResults({ outcomes: [1, 6, 6, 6, 6], replayKeys: identities, selected: [false, true, true, true, true], onSelect: vi.fn() });
    const buttons = flattenedChildren(rendered).filter((node) => node.props.class?.includes('yacht-die-button'));
    expect(buttons.map((button) => button.props['data-replay'])).toEqual([1, 3, 3, 3, 3]);
    expect(buttons.map((button) => button.key)).toEqual(['die-0-1', 'die-1-3', 'die-2-3', 'die-3-3', 'die-4-3']);
    expect(buttons[0].props.class).not.toContain('reroll-selected');
    expect(buttons.slice(1).every((button) => button.props.class.includes('reroll-selected'))).toBe(true);
  });
});
