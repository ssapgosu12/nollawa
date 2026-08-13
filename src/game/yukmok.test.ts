import { describe, expect, it } from 'vitest';
import { yukmok, type YukmokState } from './yukmok';

const place = (state: YukmokState, row: number, column: number) => yukmok.reduce(state, { type: 'place', row, column });

describe('육목 리듀서', () => {
  it('19x19에서 첫 수는 하나, 이후 각 차례는 정확히 두 수다', () => {
    const opening = place(yukmok.init(), 9, 9);
    expect(opening).toMatchObject({ turn: 2, stonesLeft: 2, moves: 1 });
    const first = place(opening, 0, 0);
    expect(first).toMatchObject({ turn: 2, stonesLeft: 1 });
    const second = place(first, 0, 1);
    expect(second).toMatchObject({ turn: 1, stonesLeft: 2 });
    expect(second.board).toHaveLength(19);
  });

  it('금수 없이 여섯 줄을 만들면 두 돌 중 첫 돌에서도 즉시 이긴다', () => {
    let state = yukmok.init();
    state = place(state, 5, 0);
    for (const pair of [[18, 0], [18, 2], [5, 1], [5, 2], [17, 4], [17, 6], [5, 3], [5, 4], [16, 8], [16, 10]] as const) state = place(state, pair[0], pair[1]);
    expect(state).toMatchObject({ turn: 1, stonesLeft: 2 });
    const won = place(state, 5, 5);
    expect(won).toMatchObject({ winner: 1, stonesLeft: 1 });
    expect(yukmok.seatsToAct(won)).toEqual([]);
  });

  it('범위 밖·점유점과 종료 뒤 수를 거부한다', () => {
    const initial = yukmok.init();
    expect(place(initial, 19, 0)).toBe(initial);
    const first = place(initial, 9, 9);
    expect(place(first, 9, 9)).toBe(first);
    const won: YukmokState = { ...first, winner: 1 };
    expect(place(won, 0, 0)).toBe(won);
    expect(yukmok.reduce(initial, { type: 'restart' })).toBe(initial);
  });

  it('종료 뒤 재시작은 선공을 교대하고 한 수 오프닝으로 돌아간다', () => {
    const ended: YukmokState = { ...yukmok.init(), winner: 1 };
    expect(yukmok.reduce(ended, { type: 'restart' })).toMatchObject({ turn: 2, starter: 2, stonesLeft: 1, moves: 0 });
  });
});
