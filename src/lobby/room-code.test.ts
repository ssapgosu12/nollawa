import { describe, expect, it } from 'vitest';
import { createRoomCode, normalizeRoomCode } from './room-code';

describe('방 코드', () => {
  it('대소문자와 구분 기호를 정규화한다', () => {
    expect(normalizeRoomCode('abc67')).toBe('ABC-67');
    expect(normalizeRoomCode('ilo-12')).toBeNull();
  });

  it('혼동 문자를 제외한 영문 3자와 숫자 2자를 만든다', () => {
    const code = createRoomCode(() => 0.5);
    expect(code).toMatch(/^[A-HJ-KM-NP-Z]{3}-[0-9]{2}$/);
  });
});
