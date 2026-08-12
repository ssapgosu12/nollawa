import { describe, expect, it } from 'vitest';
import { applyRemoteAction, legalColumns, samok, type Cell, type SamokAction, type SamokState } from './samok';

function play(columns: number[]): SamokState {
  return columns.reduce((state, column) => samok.reduce(state, { type: 'drop', column }), samok.init());
}

describe('사목 리듀서', () => {
  it('계약은 다섯 연산만 노출한다', () => {
    expect(Object.keys(samok).sort()).toEqual(['init', 'redact', 'reduce', 'seatsToAct', 'terminal'].sort());
  });

  it('중력에 따라 합법 수를 놓고 좌석을 번갈아 바꾼다', () => {
    const one = samok.reduce(samok.init(), { type: 'drop', column: 3 });
    const two = samok.reduce(one, { type: 'drop', column: 3 });
    expect(one.board[0]?.[3]).toBe(1);
    expect(two.board[1]?.[3]).toBe(2);
    expect(samok.seatsToAct(two)).toEqual([1]);
  });

  it('범위 밖과 가득 찬 열의 수를 거부한다', () => {
    const initial = samok.init();
    expect(samok.reduce(initial, { type: 'drop', column: -1 })).toBe(initial);
    const full = play([0, 0, 0, 0, 0, 0]);
    expect(samok.reduce(full, { type: 'drop', column: 0 })).toBe(full);
  });

  it.each([
    ['가로', [0, 0, 1, 1, 2, 2, 3]],
    ['세로', [0, 1, 0, 1, 0, 1, 0]],
    ['오른쪽 위 대각선', [0, 1, 1, 2, 6, 2, 2, 3, 6, 3, 5, 3, 3]],
    ['왼쪽 위 대각선', [6, 5, 5, 4, 0, 4, 4, 3, 0, 3, 1, 3, 3]],
  ])('%s 네 줄을 판정한다', (_name, columns) => {
    expect(play(columns as number[]).winner).toBe(1);
  });

  it('마지막 빈칸이 승리를 만들지 않으면 무승부다', () => {
    const rows: Cell[][] = [
      [1, 1, 2, 2, 1, 1, 2],
      [2, 2, 1, 1, 2, 2, 1],
      [1, 1, 2, 2, 1, 1, 2],
      [2, 2, 1, 1, 2, 2, 1],
      [1, 1, 2, 2, 1, 1, 2],
      [2, 2, 1, 1, 2, 2, 0],
    ];
    const almost: SamokState = { board: rows, turn: 1, winner: null, draw: false, moves: 41 };
    const finished = samok.reduce(almost, { type: 'drop', column: 6 });
    expect(samok.terminal(finished)).toEqual({ ended: true, winner: null, draw: true });
    expect(legalColumns(finished)).toEqual([]);
  });

  it('종료 뒤 상태를 바꾸지 않는다', () => {
    const won = play([0, 0, 1, 1, 2, 2, 3]);
    expect(samok.reduce(won, { type: 'drop', column: 4 })).toBe(won);
  });

  it('F2: 원격 액션은 배정 좌석의 차례에만 상태를 바꾼다', () => {
    const initial = samok.init();
    expect(applyRemoteAction(initial, { type: 'drop', column: 0 }, null)).toBe(initial);
    expect(applyRemoteAction(initial, { type: 'drop', column: 0 }, 2)).toBe(initial);
    expect(applyRemoteAction(initial, { type: 'drop', column: 0 }, 1)).not.toBe(initial);
  });

  it('F3: 종료 가드보다 먼저 재시작하고 이전 선공의 반대 좌석으로 시작한다', () => {
    const oddMoveWin = play([0, 0, 1, 1, 2, 2, 3]);
    const restarted = samok.reduce(oddMoveWin, { type: 'restart' });
    expect(restarted).toEqual({ ...samok.init(), turn: 2 });

    const nextWin = [0, 0, 1, 1, 2, 2, 3]
      .reduce((state, column) => samok.reduce(state, { type: 'drop', column }), restarted);
    expect(nextWin.winner).toBe(2);
    expect(samok.reduce(nextWin, { type: 'restart' }).turn).toBe(1);

    const oldEvenState = play([0, 1, 0, 1, 2, 1, 2, 1]);
    expect(oldEvenState.moves).toBe(8);
    expect(samok.reduce(oldEvenState, { type: 'restart' }).turn).toBe(2);
    expect(samok.reduce(samok.init(), { type: 'restart' })).toEqual(samok.init());
  });

  it('완전공개 판도 별도 복사본으로 가린다', () => {
    const state = play([2, 3]);
    const view = samok.redact(state, 1);
    expect(view).toEqual(state);
    expect(view).not.toBe(state);
    expect(view.board).not.toBe(state.board);
  });
});
