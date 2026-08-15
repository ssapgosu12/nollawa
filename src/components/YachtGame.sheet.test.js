import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createYachtEventLog } from '../game/yacht-events';
import { yachtColumnClass, yachtProjection, yachtScoreCell } from './YachtGame';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const component = readFileSync(new URL('./YachtGame.tsx', import.meta.url), 'utf8');

describe('Yacht score sheet parent acceptance', () => {
  it('acceptance 5 overlays voluntary and forced sheets below a dice-only 15 percent viewport', () => {
    expect(css).toMatch(/\.yacht-game\.sheet-active \.yacht-dice \{[^}]*position: fixed;[^}]*height: 15svh;[^}]*min-height: 15svh;/);
    expect(css).toMatch(/\.yacht-game\.sheet-active \.yacht-roll-actions \{ display: none; \}/);
    expect(css).toMatch(/\.yacht-sheet \{[^}]*position: fixed;[^}]*top: 15svh;[^}]*bottom: 0;/);
    expect(css).toMatch(/\.yacht-sheet-handle \{[^}]*z-index: 10;/);
    expect(css).toMatch(/\.yacht-sheet-handle:disabled \{ display: none; \}/);
    expect(component).toContain("sheetOpen || forced ? ' sheet-active' : ''");
    expect(component).toContain('disabled={forced}');
    expect(component).toContain('setSheetOpen((open) => !open)');
  });

  it('acceptance 6 keeps all current unused previews gray including zero and only selection yellow', () => {
    const previews = [yachtScoreCell(undefined, 0, true, false), yachtScoreCell(undefined, 15, true, true), yachtScoreCell(undefined, 30, true, false)];
    expect(previews.map(({ value }) => value)).toEqual([0, 15, 30]);
    expect(previews.map(({ className }) => className)).toEqual(['score-preview', 'score-preview selected', 'score-preview']);
    expect(yachtScoreCell(0, 50, true, true)).toEqual({ value: 0, className: '' });
    expect(yachtScoreCell(undefined, 50, false, false)).toEqual({ value: '', className: '' });
    expect(component).not.toContain("?? '—'");
  });

  it('acceptance 7 preserves seat columns and colors while current turn and self remain independent', () => {
    const seats = [{ id: 'one', name: '1P' }, { id: 'two', name: '2P' }, { id: 'three', name: '3P' }];
    const view = yachtProjection(createYachtEventLog(seats, ['three', 'one', 'two']), 'one');
    expect(view.participants.map(({ id }) => id)).toEqual(['one', 'two', 'three']);
    expect(view.currentParticipantId).toBe('three');
    expect(view.participants.map((participant, index) => yachtColumnClass(index + 1, participant.id === view.currentParticipantId, participant.id === 'one')))
      .toEqual(['player-1 self-column', 'player-2', 'player-3 current-turn']);
    expect(css).toMatch(/th\.player-1 \{[^}]*var\(--player-1\)/); expect(css).toMatch(/th\.player-2 \{[^}]*var\(--player-2\)/); expect(css).toMatch(/th\.player-3 \{[^}]*var\(--player-3\)/);
    expect(component).toContain('yacht-self-marker');
    expect(yachtProjection([{ type: 'start', participants: seats }], 'one').currentParticipantId).toBe('one');
  });
});
