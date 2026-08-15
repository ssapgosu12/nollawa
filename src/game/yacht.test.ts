import { describe, expect, it } from 'vitest';
import {
  YACHT_CATEGORIES,
  YACHT_MAXIMUM_SCORE,
  createYachtTurn,
  reduceYachtTurn,
  scoreYachtCard,
  scoreYachtCategory,
  type YachtCategory,
  type YachtDie,
  type YachtScoreEntry,
  type YachtTurnState,
} from './yacht';

const dice = (...values: YachtDie[]): readonly YachtDie[] => values;
const roll = (state: YachtTurnState, values: readonly YachtDie[]) =>
  reduceYachtTurn(state, { type: 'roll', dice: values });

describe('요트 점수 규칙', () => {
  it.each<[YachtCategory, readonly YachtDie[], number]>([
    ['ones', dice(1, 1, 2, 3, 4), 2],
    ['twos', dice(2, 2, 2, 3, 4), 6],
    ['threes', dice(3, 3, 3, 3, 1), 12],
    ['fours', dice(4, 4, 4, 4, 4), 20],
    ['fives', dice(5, 5, 1, 2, 3), 10],
    ['sixes', dice(6, 6, 6, 6, 6), 30],
    ['choice', dice(6, 6, 6, 6, 6), 30],
    ['four-kind', dice(5, 5, 5, 5, 6), 26],
    ['full-house', dice(6, 6, 6, 5, 5), 28],
    ['small-straight', dice(1, 2, 3, 4, 6), 15],
    ['large-straight', dice(2, 3, 4, 5, 6), 30],
    ['yacht', dice(4, 4, 4, 4, 4), 50],
  ])('%s 점수를 계산한다', (category, values, expected) => {
    expect(scoreYachtCategory(category, values)).toBe(expected);
  });

  it('세 스몰 스트레이트와 두 라지 스트레이트만 고정 점수다', () => {
    for (const values of [dice(1, 2, 3, 4, 4), dice(2, 3, 4, 5, 5), dice(3, 4, 5, 6, 6)]) {
      expect(scoreYachtCategory('small-straight', values)).toBe(15);
    }
    expect(scoreYachtCategory('large-straight', dice(1, 2, 3, 4, 5))).toBe(30);
    expect(scoreYachtCategory('large-straight', dice(2, 3, 4, 5, 6))).toBe(30);
  });

  it('포 다이스는 다섯 동일을 허용하지만 풀 하우스는 정확한 3+2만 허용한다', () => {
    expect(scoreYachtCategory('four-kind', dice(6, 6, 6, 6, 6))).toBe(30);
    expect(scoreYachtCategory('four-kind', dice(6, 6, 6, 5, 5))).toBe(0);
    expect(scoreYachtCategory('full-house', dice(2, 2, 2, 3, 3))).toBe(12);
    expect(scoreYachtCategory('full-house', dice(6, 6, 6, 6, 6))).toBe(0);
  });

  it.each<[YachtCategory, readonly YachtDie[]]>([
    ['four-kind', dice(1, 1, 1, 2, 2)],
    ['full-house', dice(1, 1, 1, 1, 2)],
    ['small-straight', dice(1, 2, 3, 5, 6)],
    ['large-straight', dice(1, 2, 3, 4, 4)],
    ['yacht', dice(5, 5, 5, 5, 4)],
  ])('조건을 못 채운 %s는 0점이다', (category, values) => {
    expect(scoreYachtCategory(category, values)).toBe(0);
  });

  it('상단 보너스 경계는 62/63이고 점수는 이벤트에서 다시 계산한다', () => {
    const upperDice = [
      dice(1, 1, 2, 3, 4), dice(2, 2, 1, 3, 4), dice(3, 3, 1, 2, 4),
      dice(4, 4, 4, 1, 2), dice(5, 5, 5, 5, 1), dice(6, 6, 6, 1, 2),
    ];
    const entries = YACHT_CATEGORIES.slice(0, 6).map((category, index) => ({ category, dice: upperDice[index]! }));
    expect(scoreYachtCard(entries).upperSubtotal).toBe(62);
    expect(scoreYachtCard(entries).upperBonus).toBe(0);
    const threshold = entries.map((entry) => entry.category === 'ones' ? { ...entry, dice: dice(1, 1, 1, 2, 3) } : entry);
    expect(scoreYachtCard(threshold)).toMatchObject({ upperSubtotal: 63, upperBonus: 35, total: 98 });
  });

  it('문서화된 12칸 상한과 보너스의 합은 325다', () => {
    expect(YACHT_MAXIMUM_SCORE).toBe(325);
  });

  it('잘못된 주사위와 중복 점수 이벤트를 거부한다', () => {
    expect(() => scoreYachtCategory('choice', [1, 2, 3, 4] as YachtDie[])).toThrow(RangeError);
    expect(() => scoreYachtCategory('choice', [1, 2, 3, 4, 7] as YachtDie[])).toThrow(RangeError);
    const entry: YachtScoreEntry = { category: 'ones', dice: dice(1, 1, 2, 3, 4) };
    expect(() => scoreYachtCard([entry, entry])).toThrow(RangeError);
  });
});

describe('요트 차례 리듀서', () => {
  it('첫 굴림 뒤 선택한 주사위만 재굴리고 선택 상태를 초기화한다', () => {
    const first = roll(createYachtTurn(), dice(1, 2, 3, 4, 5));
    expect(first).toMatchObject({ dice: [1, 2, 3, 4, 5], rerollSelected: [false, false, false, false, false], rolls: 1 });
    const selected = reduceYachtTurn(first, { type: 'toggle-reroll', index: 1 });
    const second = roll(selected, dice(6, 6, 6, 6, 6));
    expect(second).toMatchObject({ dice: [1, 6, 3, 4, 5], rerollSelected: [false, false, false, false, false] });
  });

  it('세 번째 굴림 뒤 점수 단계로 잠기고 네 번째 굴림과 보유 변경을 거부한다', () => {
    const first = roll(createYachtTurn(), dice(1, 2, 3, 4, 5));
    const second = roll(first, dice(2, 3, 4, 5, 6));
    const third = roll(second, dice(6, 6, 6, 6, 6));
    expect(third).toMatchObject({ rolls: 3, phase: 'scoring' });
    expect(roll(third, dice(1, 1, 1, 1, 1))).toBe(third);
    expect(reduceYachtTurn(third, { type: 'toggle-reroll', index: 0 })).toBe(third);
  });

  it('한 번 굴린 뒤 일찍 멈추면 등록 전까지 굴림이 잠긴다', () => {
    const first = roll(createYachtTurn(), dice(1, 2, 3, 4, 5));
    const stopped = reduceYachtTurn(first, { type: 'stop' });
    expect(stopped.phase).toBe('scoring');
    expect(roll(stopped, dice(6, 6, 6, 6, 6))).toBe(stopped);
  });

  it('정확히 한 미사용 칸을 등록하고 다음 플레이어 handoff를 만든다', () => {
    const scoring = reduceYachtTurn(roll(createYachtTurn(), dice(6, 6, 6, 6, 6)), { type: 'stop' });
    const complete = reduceYachtTurn(scoring, { type: 'register', category: 'yacht' });
    expect(complete).toMatchObject({ phase: 'complete', entries: [{ category: 'yacht' }] });
    expect(complete.handoff).toMatchObject({ entry: { category: 'yacht' }, card: { total: 50 } });
    expect(reduceYachtTurn(complete, { type: 'register', category: 'choice' })).toBe(complete);
  });

  it('두 번째 요트는 보너스 없이 다른 미사용 칸의 규칙대로 등록한다', () => {
    const old: YachtScoreEntry = { category: 'yacht', dice: dice(6, 6, 6, 6, 6) };
    const scoring = reduceYachtTurn(roll(createYachtTurn([old]), dice(6, 6, 6, 6, 6)), { type: 'stop' });
    expect(reduceYachtTurn(scoring, { type: 'register', category: 'yacht' })).toBe(scoring);
    const choice = reduceYachtTurn(scoring, { type: 'register', category: 'choice' });
    expect(choice.handoff?.card).toMatchObject({ scores: { yacht: 50, choice: 30 }, total: 80 });
  });

  it('첫 굴림 전 보유·중단·등록 및 malformed 굴림은 같은 상태 객체로 거부한다', () => {
    const initial = createYachtTurn();
    expect(reduceYachtTurn(initial, { type: 'toggle-reroll', index: 0 })).toBe(initial);
    expect(reduceYachtTurn(initial, { type: 'stop' })).toBe(initial);
    expect(reduceYachtTurn(initial, { type: 'register', category: 'choice' })).toBe(initial);
    expect(reduceYachtTurn(initial, { type: 'roll', dice: [1, 2, 3, 4] })).toBe(initial);
    expect(reduceYachtTurn(initial, { type: 'roll', dice: [1, 2, 3, 4, 9] })).toBe(initial);
  });
});
