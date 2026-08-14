import { describe, expect, it } from 'vitest';
import { adapterMoveKeys } from '../ai/game-adapters';
import { BoardGame } from '../components/BoardGame';
import { ForbiddenPoint, GridBoard, type BoardGridProps } from '../components/BoardGrid';
import { initGame, legalGameMoves, moveKey } from './catalog';
import { BOARD_SIZES, omok, omokForbiddenKind, type BoardSize, type OmokState } from './omok';
import type { YukmokState } from './yukmok';

const place = (state: OmokState, row: number, column: number) => omok.reduce(state, { type: 'place', row, column });
const patterns = {
  '삼삼': [[7, 6], [7, 8], [6, 7], [8, 7]],
  '사사': [[7, 5], [7, 6], [7, 8], [5, 7], [6, 7], [8, 7]],
  '장목': [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]],
} as const;
const position = (seat: 1 | 2, stones: readonly (readonly [number, number])[], size: BoardSize = 13): OmokState => {
  const state = omok.init(size);
  for (const [row, column] of stones) state.board[row]![column] = seat;
  return { ...state, turn: seat, moves: stones.length };
};

describe('오목 렌주 리듀서', () => {
  it.each(BOARD_SIZES)('%ix%i에서 가로 다섯 줄을 승리로 판정한다', (size) => {
    let state = omok.init(size);
    for (let column = 0; column < 4; column += 1) { state = place(state, 7, column); state = place(state, size - 1, column); }
    state = place(state, 7, 4);
    expect(state.winner).toBe(1);
    expect(omok.terminal(state)).toEqual({ ended: true, winner: 1, draw: false });
    expect(state.board).toHaveLength(size);
  });

  it('기본 판은 13x13이다', () => expect(omok.init().board).toHaveLength(13));

  it('흑의 삼삼 금수를 거부한다', () => {
    const state = position(1, patterns['삼삼']);
    expect(omokForbiddenKind(state, 7, 7)).toBe('삼삼');
    expect(place(state, 7, 7)).toBe(state);
  });

  it('흑의 사사 금수를 거부한다', () => {
    const state = position(1, patterns['사사']);
    expect(omokForbiddenKind(state, 7, 7)).toBe('사사');
    expect(place(state, 7, 7)).toBe(state);
  });

  it('흑의 장목 금수를 거부한다', () => {
    const state = position(1, patterns['장목']);
    expect(omokForbiddenKind(state, 7, 8)).toBe('장목');
    expect(place(state, 7, 8)).toBe(state);
  });

  it('흑의 정확히 5목은 금수보다 우선하는 합법 승리다', () => {
    const state = position(1, [[7, 3], [7, 4], [7, 5], [7, 6]]);
    expect(omokForbiddenKind(state, 7, 7)).toBeNull();
    expect(place(state, 7, 7)).toMatchObject({ winner: 1, moves: 5 });
  });

  it.each([['삼삼', 7, 7], ['사사', 7, 7], ['장목', 7, 8]] as const)('백은 %s 모양에도 제한되지 않는다', (kind, row, column) => {
    const state = position(2, patterns[kind]);
    expect(omokForbiddenKind(state, row, column)).toBeNull();
    expect(place(state, row, column)).not.toBe(state);
  });

  it('범위 밖·점유점과 종료 뒤 수를 거부한다', () => {
    const initial = omok.init();
    expect(place(initial, -1, 0)).toBe(initial);
    const first = place(initial, 0, 0);
    expect(place(first, 0, 0)).toBe(first);
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

describe('오목 금수 표시·합법 수·AI 공유', () => {
  it('흑 차례의 모든 현재 금수를 표시하고 선택과 AI 합법 수에서 제외한다', () => {
    const state = position(1, patterns['삼삼']);
    const rendered = BoardGame({ game: 'omok', state, onMove: () => undefined });
    const props = rendered.props as BoardGridProps;
    expect(rendered.type).toBe(GridBoard);
    expect(props.isLegal(7, 7)).toBe(false);
    const marker = props.overlay?.(7, 7, 750, 750) as { type: unknown; props: { kind: string } };
    expect(marker.type).toBe(ForbiddenPoint);
    expect(marker.props.kind).toBe('삼삼');
    expect(legalGameMoves('omok', state).map(moveKey)).not.toContain('7:7');
    expect(adapterMoveKeys('omok', state)).not.toContain('7:7');
  });

  it('백 차례와 육목에는 금수 표시나 필터를 적용하지 않는다', () => {
    const white = position(2, patterns['삼삼']);
    const whiteProps = BoardGame({ game: 'omok', state: white, onMove: () => undefined }).props as BoardGridProps;
    expect(whiteProps.isLegal(7, 7)).toBe(true);
    expect(whiteProps.overlay?.(7, 7, 750, 750)).toBeNull();
    const yukmok = initGame('yukmok') as YukmokState;
    for (const [row, column] of patterns['삼삼']) yukmok.board[row]![column] = 1;
    const yukmokProps = BoardGame({ game: 'yukmok', state: yukmok, onMove: () => undefined }).props as BoardGridProps;
    expect(yukmokProps.isLegal(7, 7)).toBe(true);
    expect(yukmokProps.overlay?.(7, 7, 750, 750)).toBeNull();
    expect(legalGameMoves('yukmok', yukmok).map(moveKey)).toContain('7:7');
  });

  it.each(BOARD_SIZES)('%ix%i에서 삼삼·사사·장목과 AI 회피가 동일하다', (size) => {
    for (const [kind, row, column] of [['삼삼', 7, 7], ['사사', 7, 7], ['장목', 7, 8]] as const) {
      const state = position(1, patterns[kind], size);
      expect(omokForbiddenKind(state, row, column)).toBe(kind);
      expect(legalGameMoves('omok', state).map(moveKey)).not.toContain(`${row}:${column}`);
      expect(adapterMoveKeys('omok', state)).not.toContain(`${row}:${column}`);
    }
  });
});
