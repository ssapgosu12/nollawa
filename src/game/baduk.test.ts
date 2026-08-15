import { describe, expect, it } from 'vitest';
import { baduk, badukLiberties, badukPointKey, badukPreviewFor, reduceBaduk, replayBadukActions, scoreBaduk, type BadukState } from './baduk';

const seed = (turn: 1 | 2 = 1, size: 9 | 13 | 19 = 9): BadukState => ({ ...baduk.init(size), turn });
const stone = (state: BadukState, seat: 1 | 2, ...points: [number, number][]) => { for (const [row, column] of points) state.board[row]![column] = seat; return state; };
const passTwice = (state: BadukState) => reduceBaduk(reduceBaduk(state, { type: 'pass' }, state.turn), { type: 'pass' }, state.turn === 1 ? 2 : 1);

describe('M4-BADUK-1 five-row rules population', () => {
  it('ROW 1/5: placement captures a zero-liberty adjacent group and accumulates capturer prisoners', () => {
    const state = stone(stone(seed(), 2, [1, 1]), 1, [0, 1], [1, 0], [2, 1]);
    expect(badukLiberties(state.board, { row: 1, column: 1 })).toEqual([{ row: 1, column: 2 }]);
    const next = reduceBaduk(state, { type: 'place', row: 1, column: 2 }, 1);
    expect(next.board[1]?.[1]).toBe(0);
    expect(next.board[1]?.[2]).toBe(1);
    expect(next.prisoners).toEqual({ 1: 1, 2: 0 });
    expect(badukLiberties(next.board, { row: 1, column: 2 }).length).toBeGreaterThan(0);
  });

  it('ROW 2/5: capture precedes suicide validation; suicide and immediate simple ko reject; pass intervenes', () => {
    const capture = stone(stone(seed(), 2, [0, 1], [1, 0]), 1, [0, 2], [1, 1], [2, 0]);
    const legal = reduceBaduk(capture, { type: 'place', row: 0, column: 0 }, 1);
    expect(legal).not.toBe(capture);
    expect(legal.prisoners[1]).toBe(2);
    expect(legal.board[0]?.slice(0, 2)).toEqual([1, 0]);
    const suicide = stone(seed(), 2, [0, 1], [1, 0]);
    expect(reduceBaduk(suicide, { type: 'place', row: 0, column: 0 }, 1)).toBe(suicide);

    const ko = stone(stone(seed(2), 1, [1, 1]), 2, [0, 1], [1, 0], [2, 1]);
    const repeated = ko.board.map((row) => [...row]); repeated[1]![1] = 0; repeated[1]![2] = 2; ko.previousBoard = repeated;
    expect(reduceBaduk(ko, { type: 'place', row: 1, column: 2 }, 2)).toBe(ko);
    const passed = reduceBaduk(ko, { type: 'pass' }, 2);
    expect(passed).toMatchObject({ turn: 1, consecutivePasses: 1, moves: 1 });
    const intervened = reduceBaduk(passed, { type: 'place', row: 8, column: 8 }, 1);
    expect(reduceBaduk(intervened, { type: 'place', row: 1, column: 2 }, 2)).not.toBe(intervened);
  });

  it('ROW 3/5: consecutive passes enter scoring; both colors independently mark groups and live preview removes them', () => {
    const board = stone(seed(), 2, [1, 1], [1, 2]), scoring = passTwice(board);
    expect(scoring).toMatchObject({ phase: 'scoring', consecutivePasses: 2 });
    const before = badukPreviewFor(scoring, 1), blackMarks = reduceBaduk(scoring, { type: 'toggle-dead', row: 1, column: 1 }, 1);
    expect(blackMarks.deadMarks[1]).toEqual([badukPointKey({ row: 1, column: 1 }), badukPointKey({ row: 1, column: 2 })]);
    expect(blackMarks.deadMarks[2]).toEqual([]);
    expect(badukPreviewFor(blackMarks, 1).prisoners[1]).toBe(before.prisoners[1] + 2);
    const both = reduceBaduk(blackMarks, { type: 'toggle-dead', row: 1, column: 2 }, 2);
    expect(both.deadMarks[2]).toEqual(both.deadMarks[1]);
  });

  it('ROW 4/5: mismatched submissions resume the unchanged board and later passes re-enter scoring', () => {
    const scoring = passTwice(stone(seed(), 2, [1, 1])), board = scoring.board;
    const marked = reduceBaduk(scoring, { type: 'toggle-dead', row: 1, column: 1 }, 1);
    const first = reduceBaduk(marked, { type: 'submit-score' }, 1), resumed = reduceBaduk(first, { type: 'submit-score' }, 2);
    expect(resumed.phase).toBe('play');
    expect(resumed.board).toBe(board);
    expect(resumed.board[1]?.[1]).toBe(2);
    expect(resumed.submissions).toEqual({});
    expect(passTwice(resumed).phase).toBe('scoring');
  });

  it('ROW 5/5: matching submissions finalize Korean territory plus prisoners, 6.5 komi, dame excluded, color and margin', () => {
    const state = seed(); for (const row of state.board) row.fill(1); state.board[1]![1] = 0; state.board[4]![4] = 0; state.board[4]![5] = 2; state.prisoners = { 1: 7, 2: 1 };
    const preview = scoreBaduk(state, []);
    expect(preview).toMatchObject({ black: 8, white: 7.5, neutral: 1, margin: .5, result: '흑 0.5집 승' });
    expect(preview.territory[state.starter]).toBe(1);
    const scoring = { ...state, phase: 'scoring' as const }, first = reduceBaduk(scoring, { type: 'submit-score' }, 1), final = reduceBaduk(first, { type: 'submit-score' }, 2);
    expect(final).toMatchObject({ phase: 'finished', winner: state.starter, result: '흑 0.5집 승', draw: false });
  });
});

describe('Baduk deterministic replay surface', () => {
  it('replays transported actions with transport-supplied actor seats', () => {
    const events = [{ action: { type: 'place' as const, row: 4, column: 4 }, actor: 1 as const }, { action: { type: 'pass' as const }, actor: 2 as const }];
    expect(replayBadukActions(events, 9)).toEqual(events.reduce((state, event) => reduceBaduk(state, event.action, event.actor), baduk.init(9)));
  });
});
