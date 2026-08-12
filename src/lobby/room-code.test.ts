import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_COMBINATIONS,
  createRoomCode,
  isForbiddenRoomCode,
  normalizeRoomCode,
  reserveRoomCode,
} from './room-code';

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('방 코드', () => {
  it('대소문자와 구분 기호를 정규화한다', () => {
    expect(normalizeRoomCode('abc67')).toBe('ABC-67');
    expect(normalizeRoomCode('ilo-12')).toBeNull();
  });

  it('혼동 문자를 제외한 영문 3자와 숫자 2자를 만든다', () => {
    const code = createRoomCode(() => 0.5);
    expect(code).toMatch(/^[A-HJ-KM-NP-Z]{3}-[0-9]{2}$/);
  });

  it('수십 개의 금칙 조합을 생성 중 거부하고 새 코드를 만든다', () => {
    expect(FORBIDDEN_COMBINATIONS.length).toBeGreaterThanOrEqual(20);
    const random = sequence([0, 15 / 23, 15 / 23, 0, 0, 0, 0, 0]);
    const code = createRoomCode(random);
    expect(isForbiddenRoomCode('ASS-00')).toBe(true);
    expect(code).toBe('AAA-00');
  });

  it('점유된 후보를 거부하고 유한 재생성한 코드만 반환한다', async () => {
    const seen: string[] = [];
    const random = sequence([0, 0, 0, 0, 1 / 23, 1 / 23, 1 / 23, 0.5]);
    const code = await reserveRoomCode(async (candidate) => {
      seen.push(candidate);
      return candidate !== 'AAA-00';
    }, random);
    expect(seen).toEqual(['AAA-00', 'BBB-50']);
    expect(code).toBe('BBB-50');
  });

  it('예약 통신 실패 뒤 확인하지 않은 코드를 사용하지 않는다', async () => {
    await expect(reserveRoomCode(async () => {
      throw new Error('network down');
    }, () => 0)).rejects.toThrow('network down');
  });
});
