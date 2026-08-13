import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_COMBINATIONS,
  createRoomCode,
  isForbiddenRoomCode,
  normalizeRoomCode,
  RESERVATION_TRIES,
  requestReservation,
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

describe('R1: 릴레이 cold start 실패에 재시도한다', () => {
  const noWait = async () => {};

  it('내부 오류 두 번 뒤 성공하면 예약된 것으로 본다', async () => {
    const seen: number[] = [];
    let call = 0;
    const send = async () => {
      call += 1;
      seen.push(call);
      if (call < 3) return { status: 500, ok: false };
      return { status: 201, ok: true };
    };
    await expect(requestReservation('https://relay.example/room/ABC-67', send, noWait)).resolves.toBe(true);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('응답조차 못 받아도 재시도하고, 끝까지 실패하면 사용자에게 알린다', async () => {
    let call = 0;
    const send = async () => { call += 1; throw new TypeError('Failed to fetch'); };
    await expect(requestReservation('https://relay.example/room/ABC-67', send, noWait)).rejects.toThrow('방 코드를 확인하지 못했습니다. 다시 시도해 주세요.');
    expect(call).toBe(RESERVATION_TRIES);
  });

  it('이미 쓰이는 코드(409)는 재시도하지 않고 곧바로 다음 후보로 넘긴다', async () => {
    let call = 0;
    const send = async () => { call += 1; return { status: 409, ok: false }; };
    await expect(requestReservation('https://relay.example/room/ABC-67', send, noWait)).resolves.toBe(false);
    expect(call).toBe(1);
  });
});
