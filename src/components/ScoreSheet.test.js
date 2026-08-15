import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nextScoreSheetOpen } from './ScoreSheet';
import { nextYachtSheetOpen } from './YachtGame';
import { fleetScoreSheetRows } from './FleetGame';

const sharedSource = readFileSync(new URL('./ScoreSheet.tsx', import.meta.url), 'utf8');
const yachtSource = readFileSync(new URL('./YachtGame.tsx', import.meta.url), 'utf8');
const yachtTableSource = readFileSync(new URL('./YachtScoreTable.tsx', import.meta.url), 'utf8');
const fleetSource = readFileSync(new URL('./FleetGame.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('M5-SHEET-1 population 4', () => {
  it('1/4 extracts one controlled common sheet shell used by Yacht and Fleet', () => {
    expect(yachtSource).toMatch(/import \{ ScoreSheet \} from '.\/ScoreSheet'/);
    expect(fleetSource).toMatch(/import \{ ScoreSheet \} from '.\/ScoreSheet'/);
    expect(yachtSource.match(/<ScoreSheet/g)).toHaveLength(1);
    expect(fleetSource.match(/<ScoreSheet/g)).toHaveLength(1);
    expect(yachtSource).not.toContain('<table>');
    expect(sharedSource).toContain('open: boolean');
    expect(sharedSource).toContain('onOpenChange: (open: boolean) => void');
  });

  it('2/4 preserves Yacht manual opening, forced opening, locked handle, previews, registration, fixed seats, and no local self badge', () => {
    expect(nextYachtSheetOpen(false, 'manual-toggle')).toBe(true);
    expect(nextYachtSheetOpen(false, 'rolling-continues')).toBe(false);
    expect(nextYachtSheetOpen(false, 'rolling-ended')).toBe(true);
    expect(nextScoreSheetOpen(true, true)).toBe(true);
    expect(yachtSource).toContain('locked={forced}');
    expect(yachtSource).toContain("forced ? 'rolling-ended' : 'new-rolling-turn'");
    expect(yachtTableSource).toContain('score-preview');
    expect(yachtTableSource).toContain('yacht-register');
    expect(yachtTableSource).toContain('yacht-self-marker');
    expect(yachtTableSource).toContain('!local && viewerId === participantId');
    expect(yachtTableSource).toContain('player-${seat}');
    expect(css).toMatch(/\.yacht-game\.sheet-active \.yacht-dice \{[^}]*height: 15svh/);
  });

  it('3/4 gives Fleet a manual-only shared sheet with remaining ships, ammo types, and the viewed enemy board in the top 15 percent', () => {
    const ship = (index, cells) => ({ index, length: cells.length, orientation: 'horizontal', cells });
    const state = {
      participants: [
        { id: 'p1', name: '1P', ships: [ship(0, [{ row: 0, column: 0 }]), ship(1, [{ row: 1, column: 0 }, { row: 1, column: 1 }])], variantSetup: { shootingCard: 'piercing' } },
        { id: 'p2', name: '2P', ships: [ship(0, [{ row: 2, column: 0 }])] },
      ],
      shots: [{ target: 'p1', result: 'sunk', cell: { row: 0, column: 0 } }],
    };
    expect(fleetScoreSheetRows(state)).toEqual([
      { id: 'p1', name: '1P', remainingShips: 1, shotType: '관통탄' },
      { id: 'p2', name: '2P', remainingShips: 1, shotType: '일반탄' },
    ]);
    expect(fleetSource).toContain('locked={false}');
    expect(fleetSource).toContain("useState(false)");
    expect(fleetSource).toContain("state.phase === 'placement' && !sheetOpen");
    expect(fleetSource).toMatch(/fleet-upper[^]*participant=\{target\}/);
    expect(css).toMatch(/\.fleet-screen\.sheet-active \.fleet-upper \{[^}]*height: 15svh/);
  });

  it('4/4 leaves persistence policy with each game and keeps every storage API out of the common sheet', () => {
    expect(sharedSource).not.toMatch(/sessionStorage|localStorage|indexedDB|caches\./);
    expect(sharedSource).not.toMatch(/useState|useEffect/);
    expect(sharedSource).toContain('onOpenChange(nextScoreSheetOpen(open, locked))');
    expect(yachtSource).toContain('onOpenChange={onSheetOpenChange}');
    expect(fleetSource).toContain('onOpenChange={setSheetOpen}');
  });
});
