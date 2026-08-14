import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialGameForOpening } from './App';
import { BoardGame } from './components/BoardGame';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

describe('M1-EFFECTS-5 play hint stone roles', () => {
  it('seat-2 starter cannot render the stale seat-to-color claim and labels black and white unambiguously', () => {
    const state = initialGameForOpening('omok', 2);
    state.board[0][0] = 2;
    state.board[0][1] = 1;
    const board = BoardGame({ game: 'omok', state }).props;
    const stoneRoleAt = (column) => board.renderCell(state.board[0][column], 0, column, column * 100 + 50, 50).props.children.props.seat;
    const hint = appSource.match(/<p class="hint">([^<]+)<\/p>/)?.[1] ?? '';

    expect(state).toMatchObject({ starter: 2, turn: 2 });
    expect([stoneRoleAt(0), stoneRoleAt(1)]).toEqual([1, 2]);
    expect(hint).toBe('자리를 선택한 뒤 확인하세요. 키보드는 Enter 또는 Space를 씁니다. ● 흑돌 · ■ 백돌');
    expect(hint).not.toContain('● 1번 · ■ 2번');
    expect(hint).toMatch(/● 흑돌.*■ 백돌/);
  });
});
