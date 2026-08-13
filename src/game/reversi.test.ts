import { describe, expect, it } from 'vitest';
import { legalReversiMoves, reversi, type ReversiState } from './reversi';
import type { GridCell } from './line-grid';

const move = (state: ReversiState, row: number, column: number) => reversi.reduce(state, { type: 'move', row, column });

describe('리버시 리듀서', () => {
  it('8x8 초기 네 수와 한 방향의 합법 뒤집기를 계산한다', () => {
    const initial = reversi.init();
    expect(legalReversiMoves(initial)).toEqual(expect.arrayContaining([{ row: 2, column: 3 }, { row: 3, column: 2 }, { row: 4, column: 5 }, { row: 5, column: 4 }]));
    const played = move(initial, 2, 3);
    expect(played.board[2]?.[3]).toBe(1);
    expect(played.board[3]?.[3]).toBe(1);
    expect(played.turn).toBe(2);
  });

  it('상대에게 합법 수가 없으면 자동 패스하고 현재 좌석이 다시 둔다', () => {
    const board = Array.from({ length: 8 }, () => Array<GridCell>(8).fill(1));
    board[0] = [0, 2, 1, 0, 2, 1, 1, 1];
    const state: ReversiState = { board, turn: 1, winner: null, draw: false, moves: 58, starter: 1 };
    const passed = move(state, 0, 0);
    expect(passed.turn).toBe(1);
    expect(legalReversiMoves(passed, 2)).toEqual([]);
    expect(legalReversiMoves(passed, 1)).toEqual([{ row: 0, column: 3 }]);
  });

  it('양쪽 모두 둘 곳이 없어지면 돌 수로 끝내고 재시작한다', () => {
    const board = Array.from({ length: 8 }, () => Array<GridCell>(8).fill(1));
    board[0] = [1, 1, 1, 0, 2, 1, 1, 1];
    const final = move({ board, turn: 1, winner: null, draw: false, moves: 59, starter: 1 }, 0, 3);
    expect(reversi.terminal(final)).toEqual({ ended: true, winner: 1, draw: false });
    const restarted = reversi.reduce(final, { type: 'restart' });
    expect(restarted).toMatchObject({ turn: 2, starter: 2, moves: 0, winner: null });
    expect(restarted.board.flat().filter(Boolean)).toHaveLength(4);
  });

  it('점유칸·뒤집을 수 없는 칸·범위 밖·종료 뒤 액션을 거부한다', () => {
    const initial = reversi.init();
    expect(move(initial, 3, 3)).toBe(initial);
    expect(move(initial, 0, 0)).toBe(initial);
    expect(move(initial, -1, 0)).toBe(initial);
    const ended: ReversiState = { ...initial, winner: 1 };
    expect(move(ended, 2, 3)).toBe(ended);
  });

  it('완전공개 판도 별도 복사본으로 가린다', () => {
    const initial = reversi.init(), view = reversi.redact(initial, 1);
    expect(view).toEqual(initial);
    expect(view.board).not.toBe(initial.board);
  });
});
