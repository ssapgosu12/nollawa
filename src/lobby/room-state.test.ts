import { describe, expect, it } from 'vitest';
import type { Transport } from '../transport/transport';
import { canStartRoom, isRoomHost, MAIN_DESTINATIONS, readyLabel, requiredReady, reuseRemoteTransport, roomSlots, teamForSlot, type RoomSnapshot } from './room-state';

function snapshot(total: number, ready: number, slots = Array.from({ length: total }, (_, index) => index + 1)): RoomSnapshot {
  return {
    code: 'ABC-67', hostId: 'p1', game: 'samok', teamNames: ['콜라', '사이다'], phase: 'lobby',
    participants: slots.map((slot, index) => ({ id: `p${index + 1}`, slot, name: `사람 ${index + 1}`, ready: index < ready, present: true })),
  };
}

describe('L2: 메인 3버튼과 단일 원격 전송', () => {
  it('세 버튼의 목적지는 로컬 게임 목록과 두 원격 로비다', () => {
    expect(MAIN_DESTINATIONS).toEqual([['이 기기에서 플레이', 'games'], ['방 참여', 'lobby'], ['방 생성', 'lobby']]);
  });

  it('로비에서 게임 목록과 대국으로 이동해도 열린 전송을 재사용한다', () => {
    const existing = {} as Transport<unknown>;
    let created = 0;
    expect(reuseRemoteTransport(existing, () => { created += 1; return {} as Transport<unknown>; })).toBe(existing);
    expect(created).toBe(0);
    expect(reuseRemoteTransport(null, () => { created += 1; return existing; })).toBe(existing);
    expect(created).toBe(1);
  });
});

describe('L3: 여섯 슬롯과 준비 계약', () => {
  it('항상 여섯 슬롯을 만들고 준비 표와 실제 방 인원 분모를 표시한다', () => {
    expect(roomSlots(snapshot(3, 2))).toHaveLength(6);
    expect(requiredReady(2)).toBe(2);
    expect(requiredReady(3)).toBe(2);
    expect(requiredReady(4)).toBe(3);
    expect(requiredReady(5)).toBe(3);
    expect(requiredReady(6)).toBe(4);
    expect(readyLabel(snapshot(4, 3))).toBe('3/4 준비됨');
  });

  it.each([[2, 2], [3, 2], [4, 3], [5, 3], [6, 4]])('%i명 방은 정확히 %i명부터 시작 가능하다', (total, needed) => {
    expect(canStartRoom(snapshot(total, needed - 1))).toBe(false);
    expect(canStartRoom(snapshot(total, needed))).toBe(true);
  });
});

describe('L5: 좌우 팀과 기본 팀명', () => {
  it('홀수 슬롯은 왼쪽 1팀, 짝수 슬롯은 오른쪽 2팀이다', () => {
    expect([1, 2, 3, 4, 5, 6].map(teamForSlot)).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it('한 팀이 비면 시작하지 않는다', () => {
    expect(canStartRoom(snapshot(2, 2, [1, 3]))).toBe(false);
  });

});

describe('L4: 방장 UI 권한', () => {
  it('방장 여부가 비방장 선택 UI의 disabled 근거다', () => {
    expect(isRoomHost(snapshot(2, 2), 'p1')).toBe(true);
    expect(isRoomHost(snapshot(2, 2), 'p2')).toBe(false);
  });
});
