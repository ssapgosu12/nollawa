import { describe, expect, it } from 'vitest';
import { omok, type OmokState } from './omok';

const place = (state: OmokState, row: number, column: number) => omok.reduce(state, { type: 'place', row, column });

describe('오목 자유룰 리듀서', () => {
  it('15x15에서 가로 다섯 줄을 승리로 판정한다', () => {
    let state = omok.init();
    for (let column = 0; column < 4; column += 1) { state = place(state, 7, column); state = place(state, 14, column); }
    state = place(state, 7, 4);
    expect(state.winner).toBe(1);
    expect(omok.terminal(state)).toEqual({ ended: true, winner: 1, draw: false });
    expect(state.board).toHaveLength(15);
  });

  it('첫 수 뒤 상대가 스왑하면 첫 돌 소유와 다음 차례가 바뀐다', () => {
    const opening = place(omok.init(), 7, 7);
    expect(opening).toMatchObject({ turn: 2, swapAvailable: true, moves: 1 });
    const swapped = omok.reduce(opening, { type: 'swap' });
    expect(swapped.board[7]?.[7]).toBe(2);
    expect(swapped).toMatchObject({ turn: 1, starter: 2, swapAvailable: false, moves: 1 });
  });

  it('범위 밖·점유점·잘못된 시점의 스왑과 종료 뒤 수를 거부한다', () => {
    const initial = omok.init();
    expect(omok.reduce(initial, { type: 'swap' })).toBe(initial);
    expect(place(initial, -1, 0)).toBe(initial);
    const first = place(initial, 0, 0);
    expect(place(first, 0, 0)).toBe(first);
    const second = place(first, 1, 0);
    expect(omok.reduce(second, { type: 'swap' })).toBe(second);
    let won = initial;
    for (let column = 0; column < 4; column += 1) { won = place(won, 2, column); won = place(won, 10, column); }
    won = place(won, 2, 4);
    expect(place(won, 3, 3)).toBe(won);
  });

  it('종료 뒤 재시작은 선공을 교대하고 완전공개 판을 복사한다', () => {
    let won = omok.init();
    for (let column = 0; column < 4; column += 1) { won = place(won, 3, column); won = place(won, 12, column); }
    won = place(won, 3, 4);
    const restarted = omok.reduce(won, { type: 'restart' });
    expect(restarted).toMatchObject({ turn: 2, starter: 2, moves: 0 });
    const view = omok.redact(restarted, 1);
    expect(view).toEqual(restarted);
    expect(view.board).not.toBe(restarted.board);
  });
});
