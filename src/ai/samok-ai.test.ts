import { describe, expect, it } from 'vitest';
import { legalColumns, samok } from '../game/samok';
import { chooseSamokMove, greedySamokMove } from './samok-ai';

describe('사목 전용 AI', () => {
  it('5수 탐색이 즉시 이기는 합법 열을 고른다', () => {
    const state = [0, 0, 1, 1, 2, 2].reduce(
      (current, column) => samok.reduce(current, { type: 'drop', column }), samok.init(),
    );
    expect(chooseSamokMove(state)).toBe(3);
  });

  it('탐욕 폴백과 탐색 결과는 항상 합법이다', () => {
    const state = [3, 3, 2, 4, 2].reduce(
      (current, column) => samok.reduce(current, { type: 'drop', column }), samok.init(),
    );
    expect(legalColumns(state)).toContain(greedySamokMove(state));
    expect(legalColumns(state)).toContain(chooseSamokMove(state));
  });
});
