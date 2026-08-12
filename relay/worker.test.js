import { describe, expect, it } from 'vitest';
import { activeWebSockets, lowestFreeSeat, Room } from './worker.js';

function socket(seat, readyState = 1) {
  return { readyState, deserializeAttachment: () => ({ seat }) };
}

function relaySocket(label) {
  let attachment = {};
  return {
    label,
    readyState: 1,
    messages: [],
    deserializeAttachment: () => attachment,
    serializeAttachment: (value) => { attachment = value; },
    send(raw) { this.messages.push(JSON.parse(raw)); },
    close() { this.readyState = 3; },
  };
}

function roomHarness() {
  const sockets = [];
  const values = {};
  const storage = {
    async get(key) {
      if (Array.isArray(key)) {
        return new Map(key.filter((name) => Object.hasOwn(values, name)).map((name) => [name, values[name]]));
      }
      return values[key];
    },
    async put(value) { Object.assign(values, value); },
    async setAlarm() {},
  };
  const state = {
    storage,
    getWebSockets: () => sockets,
    acceptWebSocket(value) { sockets.push(value); },
    blockConcurrencyWhile(callback) { return callback(); },
  };
  return { room: new Room(state), sockets, values };
}

describe('L1: 릴레이 좌석 수명주기', () => {
  it('정상 close는 해당 소켓 좌석을 반납하고 authority와 peer 상태를 재배정한다', async () => {
    const { room, values } = roomHarness();
    const first = relaySocket('first');
    const second = relaySocket('second');
    await room.attach(first, 'device-key-first');
    await room.attach(second, 'device-key-second');

    first.close();
    await room.webSocketClose(first, 1000, 'Normal closure', true);

    expect(first.deserializeAttachment().seat).toBeNull();
    expect(values.authority).toBe(second.deserializeAttachment().id);
    expect(second.messages).toContainEqual({ type: 'authority', authority: second.deserializeAttachment().id });
    expect(second.messages).toContainEqual({ type: 'peers', count: 1 });
  });

  it('new-open-before-old-close는 같은 안정 키의 기존 좌석을 승계한다', async () => {
    const { room } = roomHarness();
    const oldSocket = relaySocket('old');
    const replacement = relaySocket('replacement');
    await room.attach(oldSocket, 'device-key-same');
    const oldIdentity = oldSocket.deserializeAttachment();

    await room.attach(replacement, 'device-key-same');
    await room.webSocketClose(oldSocket, 1000, 'Replaced', true);

    expect(replacement.deserializeAttachment()).toMatchObject({ id: oldIdentity.id, seat: 1 });
    expect(oldSocket.deserializeAttachment().seat).toBeNull();
  });

  it('close-before-new도 같은 참가자를 정확히 한 좌석에 남긴다', async () => {
    const { room, sockets } = roomHarness();
    const first = relaySocket('first');
    const peer = relaySocket('peer');
    await room.attach(first, 'device-key-first');
    await room.attach(peer, 'device-key-peer');
    first.close();
    await room.webSocketClose(first, 1000, 'Normal closure', true);

    const replacement = relaySocket('replacement');
    await room.attach(replacement, 'device-key-first');

    const activeClaims = activeWebSockets(sockets)
      .filter((candidate) => candidate.deserializeAttachment().reconnectKey === 'device-key-first')
      .map((candidate) => candidate.deserializeAttachment().seat);
    expect(activeClaims).toEqual([1]);
    expect(replacement.deserializeAttachment().id).toBe(first.deserializeAttachment().id);
  });

  it('다른 참가자는 정상 반납된 좌석을 재사용한다', async () => {
    const { room } = roomHarness();
    const departed = relaySocket('departed');
    const peer = relaySocket('peer');
    await room.attach(departed, 'device-key-departed');
    await room.attach(peer, 'device-key-peer');
    departed.close();
    await room.webSocketClose(departed, 1000, 'Normal closure', true);

    const newcomer = relaySocket('newcomer');
    await room.attach(newcomer, 'device-key-newcomer');

    expect(newcomer.deserializeAttachment().seat).toBe(1);
  });

  it('같은 안정 키는 두 활성 좌석을 동시에 소유할 수 없다', async () => {
    const { room, sockets } = roomHarness();
    const duplicateOne = relaySocket('legacy-one');
    duplicateOne.serializeAttachment({ id: 'server-one', reconnectKey: 'device-key-same', seat: 1 });
    const duplicateTwo = relaySocket('legacy-two');
    duplicateTwo.serializeAttachment({ id: 'server-two', reconnectKey: 'device-key-same', seat: 2 });
    sockets.push(duplicateOne, duplicateTwo);
    await room.attach(relaySocket('replacement'), 'device-key-same');

    const claims = activeWebSockets(sockets)
      .filter((candidate) => candidate.deserializeAttachment().reconnectKey === 'device-key-same')
      .map((candidate) => candidate.deserializeAttachment().seat);
    expect(claims).toEqual([1]);
  });

  it('서로 다른 두 참가자는 서로 다른 좌석과 서버 id를 받는다', async () => {
    const { room } = roomHarness();
    const first = relaySocket('first');
    const second = relaySocket('second');
    await room.attach(first, 'device-key-first');
    await room.attach(second, 'device-key-second');

    expect(first.deserializeAttachment().seat).toBe(1);
    expect(second.deserializeAttachment().seat).toBe(2);
    expect(first.deserializeAttachment().id).not.toBe(second.deserializeAttachment().id);
  });

  it('낮은 빈 좌석을 고르고 종료된 소켓은 점유자로 세지 않는다', () => {
    expect(lowestFreeSeat([])).toBe(1);
    expect(lowestFreeSeat([socket(1)])).toBe(2);
    expect(lowestFreeSeat([socket(1), socket(2)])).toBeNull();
    expect(lowestFreeSeat(activeWebSockets([socket(1, 3), socket(2)]))).toBe(1);
  });

  it('클라이언트가 보낸 actor를 attachment의 서버 id와 좌석으로 덮어쓴다', async () => {
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
