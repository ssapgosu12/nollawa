import { describe, expect, it } from 'vitest';
import { activeWebSockets, lowestFreeSeat, Room } from './worker.js';

function socket(seat, readyState = 1) {
  return { readyState, deserializeAttachment: () => ({ seat }) };
}

describe('F2: 릴레이 좌석 수명주기', () => {
  it('낮은 빈 좌석을 배정하고 종료된 소켓의 좌석을 재사용한다', () => {
    expect(lowestFreeSeat([])).toBe(1);
    expect(lowestFreeSeat([socket(1)])).toBe(2);
    expect(lowestFreeSeat([socket(1), socket(2)])).toBeNull();

    const afterDisconnect = activeWebSockets([socket(1, 3), socket(2)]);
    expect(lowestFreeSeat(afterDisconnect)).toBe(1);
  });

  it('클라이언트가 보낸 actor를 attachment의 id와 좌석으로 덮어쓴다', async () => {
    let forwarded;
    let senderAttachment = { id: 'sender', seat: 2, lastSeen: 0 };
    const authority = {
      readyState: 1,
      deserializeAttachment: () => ({ id: 'authority', seat: 1 }),
      send: (raw) => { forwarded = JSON.parse(raw); },
    };
    const sender = {
      deserializeAttachment: () => senderAttachment,
      serializeAttachment: (value) => { senderAttachment = value; },
    };
    const room = new Room({
      getWebSockets: () => [authority],
      storage: { get: async () => 'authority' },
    });

    await room.webSocketMessage(sender, JSON.stringify({
      type: 'action',
      action: { type: 'restart' },
      actor: { id: 'forged', seat: 1 },
    }));

    expect(forwarded.actor).toEqual({ id: 'sender', seat: 2 });
    expect(forwarded.action).toEqual({ type: 'restart' });
  });
});
