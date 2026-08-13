import { describe, expect, it } from 'vitest';
import { activeWebSockets, applyRoomCommand, lowestFreeSeat, requiredReady, roomSeat, Room, TEAM_PAIRS, teamSeat } from './worker.js';

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

describe('L3: 권위 있는 여섯 슬롯 snapshot', () => {
  it('일곱 번째 연결은 참가자 슬롯을 얻지 못하고 snapshot 모집단은 정확히 여섯 명이다', async () => {
    const { room, values } = roomHarness();
    const sockets = Array.from({ length: 7 }, (_, index) => relaySocket(`p${index + 1}`));
    for (const [index, connection] of sockets.entries()) await room.attach(connection, `device-key-person-${index + 1}`, `사람 ${index + 1}`);
    expect(values.room.participants).toHaveLength(6);
    expect(values.room.participants.map((person) => person.slot)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(values.room.hostId).toBe(values.room.participants[0].id);
    expect(values.room.participants[0].name).toBe('사람 1');
    expect(sockets[6].deserializeAttachment().seat).toBeNull();
    const snapshot = sockets[6].messages.at(-2).room;
    expect(snapshot.participants).toHaveLength(6);
    expect(snapshot.participants[0]).not.toHaveProperty('reconnectKey');
  });
});

describe('L4: 방장 권한과 슬롯 이동', () => {
  it('위조한 비방장 발신자의 모든 방장 명령을 릴레이가 거부한다', async () => {
    const { room, values } = roomHarness();
    const host = relaySocket('host');
    const guest = relaySocket('guest');
    await room.attach(host, 'device-key-host', '방장');
    await room.attach(guest, 'device-key-guest', '손님');
    const before = JSON.stringify(values.room);
    const hostId = host.deserializeAttachment().id;
    for (const command of [
      { command: 'select-game', game: 'forged' }, { command: 'start' },
      { command: 'kick', target: hostId }, { command: 'promote', target: hostId },
      { command: 'move', target: hostId, slot: 6 }, { command: 'team-name', team: 1, name: '위조' },
    ]) await room.webSocketMessage(guest, JSON.stringify({ type: 'room-command', ...command }));
    expect(JSON.stringify(values.room)).toBe(before);
    expect(guest.messages.filter((message) => message.type === 'room-error')).toHaveLength(6);
  });

  it('방장은 선택·시작·추방·위임에 성공하고 비방장 준비도 허용한다', () => {
    const base = () => ({ code: 'ABC-67', hostId: 'p1', game: 'samok', teamNames: ['콜라', '사이다'], phase: 'lobby', participants: [
      { id: 'p1', slot: 1, ready: true }, { id: 'p2', slot: 2, ready: true }, { id: 'p3', slot: 3, ready: false },
    ] });
    const selected = base();
    expect(applyRoomCommand(selected, 'p1', { command: 'select-game', game: 'samok-next' })).toBe(true);
    expect(selected.game).toBe('samok-next');
    expect(applyRoomCommand(selected, 'p2', { command: 'ready' })).toBe(true);
    expect(selected.participants[1].ready).toBe(false);
    const started = base();
    expect(applyRoomCommand(started, 'p1', { command: 'start' })).toBe(true);
    expect(started.phase).toBe('play');
    const kicked = base();
    expect(applyRoomCommand(kicked, 'p1', { command: 'kick', target: 'p3' })).toBe(true);
    expect(kicked.participants.map((person) => person.id)).toEqual(['p1', 'p2']);
    const promoted = base();
    expect(applyRoomCommand(promoted, 'p1', { command: 'promote', target: 'p2' })).toBe(true);
    expect(promoted.hostId).toBe('p2');
  });

  it('빈 슬롯 이동과 점유 슬롯 맞바꾸기는 이동자 전원의 준비를 풀며 대국 중 이동은 거부한다', () => {
    const room = { hostId: 'p1', phase: 'lobby', participants: [
      { id: 'p1', slot: 1, ready: true }, { id: 'p2', slot: 2, ready: true }, { id: 'p3', slot: 4, ready: true },
    ] };
    expect(applyRoomCommand(room, 'p1', { command: 'move', target: 'p1', slot: 3 })).toBe(true);
    expect(room.participants[0]).toMatchObject({ slot: 3, ready: false });
    room.participants[0].ready = true;
    expect(applyRoomCommand(room, 'p1', { command: 'move', target: 'p1', slot: 4 })).toBe(true);
    expect(room.participants[0]).toMatchObject({ slot: 4, ready: false });
    expect(room.participants[2]).toMatchObject({ slot: 3, ready: false });
    room.phase = 'play';
    expect(applyRoomCommand(room, 'p1', { command: 'move', target: 'p2', slot: 5 })).toBe(false);
    expect(room.participants[1].slot).toBe(2);
  });

  it('CORRECTION: 빈 슬롯 이동과 점유 swap은 영향받은 클라이언트에게만 새 identity 팀을 보낸다', async () => {
    const { room } = roomHarness();
    const host = relaySocket('host');
    const guest = relaySocket('guest');
    await room.attach(host, 'device-key-host', '방장');
    await room.attach(guest, 'device-key-guest', '손님');

    host.messages.length = 0;
    guest.messages.length = 0;
    await room.webSocketMessage(host, JSON.stringify({ type: 'room-command', command: 'move', target: guest.deserializeAttachment().id, slot: 3 }));
    expect(guest.messages.filter((message) => message.type === 'identity')).toEqual([
      { type: 'identity', id: guest.deserializeAttachment().id, authority: host.deserializeAttachment().id, seat: 1 },
    ]);
    expect(host.messages.filter((message) => message.type === 'identity')).toEqual([]);

    await room.webSocketMessage(host, JSON.stringify({ type: 'room-command', command: 'move', target: guest.deserializeAttachment().id, slot: 2 }));
    host.messages.length = 0;
    guest.messages.length = 0;
    await room.webSocketMessage(host, JSON.stringify({ type: 'room-command', command: 'move', target: host.deserializeAttachment().id, slot: 2 }));
    expect(host.deserializeAttachment().seat).toBe(2);
    expect(guest.deserializeAttachment().seat).toBe(1);
    expect(host.messages.filter((message) => message.type === 'identity')).toEqual([
      { type: 'identity', id: host.deserializeAttachment().id, authority: host.deserializeAttachment().id, seat: 2 },
    ]);
    expect(guest.messages.filter((message) => message.type === 'identity')).toEqual([
      { type: 'identity', id: guest.deserializeAttachment().id, authority: host.deserializeAttachment().id, seat: 1 },
    ]);

    host.messages.length = 0;
    guest.messages.length = 0;
    await room.webSocketMessage(guest, JSON.stringify({ type: 'room-command', command: 'ready' }));
    await room.webSocketMessage(host, JSON.stringify({ type: 'room-command', command: 'team-name', team: 1, name: '새 팀' }));
    expect([...host.messages, ...guest.messages].filter((message) => message.type === 'identity')).toEqual([]);
  });
});

describe('N2: 릴레이의 암묵적 방장 준비 권한', () => {
  it('위조한 방장 ready는 거부하고 준비 손님 둘과 암묵적 방장으로 4명 방을 시작한다', () => {
    const room = { hostId: 'p1', phase: 'lobby', participants: [
      { id: 'p1', slot: 1, ready: false }, { id: 'p2', slot: 2, ready: true },
      { id: 'p3', slot: 3, ready: true }, { id: 'p4', slot: 4, ready: false },
    ] };
    expect(applyRoomCommand(room, 'p1', { command: 'ready' })).toBe(false);
    expect(applyRoomCommand(room, 'p2', { command: 'start' })).toBe(false);
    expect(room.participants[0].ready).toBe(false);
    expect(applyRoomCommand(room, 'p1', { command: 'start' })).toBe(true);
  });
});

describe('N6: authoritative 게임 설정 command', () => {
  it('방장 AI 설정은 room snapshot을 바꾸고 손님의 같은 명령은 거부된다', async () => {
    const { room, values } = roomHarness();
    const host = relaySocket('host');
    const guest = relaySocket('guest');
    await room.attach(host, 'device-key-host', '방장');
    await room.attach(guest, 'device-key-guest', '손님');
    await room.webSocketMessage(host, JSON.stringify({ type: 'room-command', command: 'set-ai-opponent', enabled: true }));
    expect(values.room.settings).toEqual({ aiOpponent: true, aiStrength: 'normal' });
    expect(guest.messages.filter((message) => message.type === 'room').at(-1).room.settings).toEqual({ aiOpponent: true, aiStrength: 'normal' });
    await room.webSocketMessage(guest, JSON.stringify({ type: 'room-command', command: 'set-ai-opponent', enabled: false }));
    expect(values.room.settings).toEqual({ aiOpponent: true, aiStrength: 'normal' });
    expect(guest.messages.at(-1)).toEqual({ type: 'room-error', message: '허용되지 않은 방 명령' });
  });
});

describe('S1: relay-owned 참가자 활동과 play 모집단', () => {
  it('발신 identity로 lobby/game-list/play를 전파하고 play 중 신규 참가자는 대기/무좌석이다', async () => {
    const { room, values } = roomHarness();
    const host = relaySocket('host');
    const guest = relaySocket('guest');
    await room.attach(host, 'device-key-host', '방장');
    await room.attach(guest, 'device-key-guest', '손님');
    const guestId = guest.deserializeAttachment().id;
    await room.webSocketMessage(guest, JSON.stringify({ type: 'room-command', command: 'set-activity', activity: 'games', id: host.deserializeAttachment().id }));
    expect(values.room.participants.find((person) => person.id === guestId).activity).toBe('games');
    expect(values.room.participants.find((person) => person.id !== guestId).activity).toBe('lobby');
    await room.webSocketMessage(guest, JSON.stringify({ type: 'room-command', command: 'set-activity', activity: 'lobby' }));
    await room.webSocketMessage(guest, JSON.stringify({ type: 'room-command', command: 'ready' }));
    await room.webSocketMessage(host, JSON.stringify({ type: 'room-command', command: 'start' }));
    expect(values.room.participants.map((person) => person.activity)).toEqual(['play', 'play']);
    guest.close();
    await room.webSocketClose(guest);
    expect(values.room.participants.find((person) => person.id === guestId)).toMatchObject({ slot: 2, activity: 'play' });
    expect(host.messages.filter((message) => message.type === 'room').at(-1).room.participants.find((person) => person.id === guestId)).toMatchObject({ slot: 2, present: false });
    const newcomer = relaySocket('newcomer');
    await room.attach(newcomer, 'device-key-newcomer', '새 참가자');
    expect(values.room.participants.at(-1)).toMatchObject({ activity: 'lobby', ready: false });
    expect(newcomer.deserializeAttachment().seat).toBeNull();
    expect(newcomer.messages.filter((message) => message.type === 'room').at(-1).room.participants.at(-1)).toMatchObject({ activity: 'lobby', present: true });
  });
});

describe('S2: authoritative AI 강도 default/migration/host gate', () => {
  it('기본·legacy는 보통이고 방장 high만 snapshot으로 공유하며 손님 변경은 거부한다', async () => {
    const { room, values } = roomHarness();
    const host = relaySocket('host');
    const guest = relaySocket('guest');
    await room.attach(host, 'device-key-host', '방장');
    expect(values.room.settings.aiStrength).toBe('normal');
    values.room.settings = { aiOpponent: true };
    await room.attach(guest, 'device-key-guest', '손님');
    expect(values.room.settings).toEqual({ aiOpponent: true, aiStrength: 'normal' });
    await room.webSocketMessage(host, JSON.stringify({ type: 'room-command', command: 'set-ai-strength', strength: 'high' }));
    expect(guest.messages.filter((message) => message.type === 'room').at(-1).room.settings.aiStrength).toBe('high');
    await room.webSocketMessage(guest, JSON.stringify({ type: 'room-command', command: 'set-ai-strength', strength: 'normal' }));
    expect(values.room.settings.aiStrength).toBe('high');
    expect(guest.messages.at(-1)).toMatchObject({ type: 'room-error' });
  });
});

describe('N4 AI-ON/OFF: relay-owned seat projection and start gate', () => {
  it('AI-on은 모든 인간을 1번으로 재투영하고 action actor도 1번이며 AI-off는 홀짝 좌석을 복구한다', async () => {
    const { room, values } = roomHarness();
    const host = relaySocket('host');
    const guest = relaySocket('guest');
    await room.attach(host, 'device-key-host', '방장');
    await room.attach(guest, 'device-key-guest', '손님');
    await room.webSocketMessage(host, JSON.stringify({ type: 'room-command', command: 'set-ai-opponent', enabled: true }));
    expect([host, guest].map((socket) => socket.deserializeAttachment().seat)).toEqual([1, 1]);
    expect(values.room.participants.map((person) => roomSeat(values.room, person))).toEqual([1, 1]);
    await room.webSocketMessage(guest, JSON.stringify({ type: 'action', action: { type: 'vote', move: '3' } }));
    expect(host.messages.findLast((message) => message.type === 'action').actor).toEqual({ id: guest.deserializeAttachment().id, seat: 1 });
    await room.webSocketMessage(host, JSON.stringify({ type: 'room-command', command: 'set-ai-opponent', enabled: false }));
    expect([host, guest].map((socket) => socket.deserializeAttachment().seat)).toEqual([1, 2]);
  });

  it('AI-on만 양 팀 최소를 면제해 1인 방을 시작하고 readiness 표 자체는 바꾸지 않는다', () => {
    const oneHuman = (aiOpponent) => ({ hostId: 'p1', settings: { aiOpponent }, phase: 'lobby', participants: [{ id: 'p1', slot: 1, ready: false }] });
    expect([1, 2, 3, 4, 5, 6].map(requiredReady)).toEqual([0, 2, 2, 3, 3, 4]);
    expect(applyRoomCommand(oneHuman(true), 'p1', { command: 'start' })).toBe(true);
    expect(applyRoomCommand(oneHuman(false), 'p1', { command: 'start' })).toBe(false);
  });
});

describe('L5: 팀 상태와 재연결', () => {
  it('준비 표, 교대 팀 좌석, 비어 있지 않은 양 팀을 릴레이가 시작 조건으로 사용한다', () => {
    expect([2, 3, 4, 5, 6].map(requiredReady)).toEqual([2, 2, 3, 3, 4]);
    expect([1, 2, 3, 4, 5, 6].map(teamSeat)).toEqual([1, 2, 1, 2, 1, 2]);
    const oneTeam = { hostId: 'p1', phase: 'lobby', participants: [{ id: 'p1', slot: 1, ready: true }, { id: 'p2', slot: 3, ready: true }] };
    expect(applyRoomCommand(oneTeam, 'p1', { command: 'start' })).toBe(false);
  });

  it('방장만 두 팀 이름을 바꾸고 기본값은 정본 대립쌍 중 하나다', async () => {
    const { room, values } = roomHarness();
    const host = relaySocket('host');
    const guest = relaySocket('guest');
    await room.attach(host, 'device-key-host', '방장');
    await room.attach(guest, 'device-key-guest', '손님');
    expect(TEAM_PAIRS).toContainEqual(values.room.teamNames);
    expect(applyRoomCommand(values.room, guest.deserializeAttachment().id, { command: 'team-name', team: 1, name: '안 됨' })).toBe(false);
    expect(applyRoomCommand(values.room, host.deserializeAttachment().id, { command: 'team-name', team: 1, name: '왼쪽' })).toBe(true);
    expect(values.room.teamNames[0]).toBe('왼쪽');
  });

  it('재연결은 참가자를 복제하지 않고 같은 명시 슬롯을 보존한다', async () => {
    const { room, values } = roomHarness();
    const first = relaySocket('first');
    const peer = relaySocket('peer');
    await room.attach(first, 'device-key-first', '첫째');
    await room.attach(peer, 'device-key-peer', '둘째');
    const original = { ...values.room.participants[0] };
    first.close();
    await room.webSocketClose(first);
    const replacement = relaySocket('replacement');
    await room.attach(replacement, 'device-key-first', '첫째');
    expect(values.room.participants).toHaveLength(2);
    expect(values.room.participants[0]).toMatchObject({ id: original.id, slot: original.slot });
    expect(replacement.deserializeAttachment()).toMatchObject({ id: original.id, seat: teamSeat(original.slot) });
  });
});

describe('P3-P6: authoritative 로비 복귀와 퇴장 수명주기', () => {
  it('P3/P5: host 로비 복귀 한 명령은 phase와 전원 ready를 함께 초기화하고 ready를 다시 허용한다', async () => {
    const { room, values } = roomHarness();
    const host = relaySocket('host');
    const guest = relaySocket('guest');
    await room.attach(host, 'device-key-host', '방장');
    await room.attach(guest, 'device-key-guest', '손님');
    values.room.phase = 'play';
    values.room.participants.forEach((person) => { person.ready = true; });

    await room.webSocketMessage(host, JSON.stringify({ type: 'room-command', command: 'return-lobby' }));

    expect(values.room).toMatchObject({ phase: 'lobby', participants: [{ ready: false }, { ready: false }] });
    expect(guest.messages.filter((message) => message.type === 'room').at(-1).room.phase).toBe('lobby');
    expect(applyRoomCommand(values.room, guest.deserializeAttachment().id, { command: 'ready' })).toBe(true);
  });

  it('P4: guest 로비 복귀는 참가자와 좌석에서 제거하고 남은 판이 성립하면 phase를 유지한다', async () => {
    const { room, values } = roomHarness();
    const host = relaySocket('host');
    const guest = relaySocket('guest');
    const leaving = relaySocket('leaving');
    await room.attach(host, 'device-key-host', '방장');
    await room.attach(guest, 'device-key-guest', '손님');
    await room.attach(leaving, 'device-key-leaving', '퇴장자');
    values.room.phase = 'play';

    await room.webSocketMessage(leaving, JSON.stringify({ type: 'room-command', command: 'return-lobby' }));

    expect(values.room.phase).toBe('play');
    expect(values.room.participants.map((person) => person.id)).not.toContain(leaving.deserializeAttachment().id);
    expect(leaving.deserializeAttachment().seat).toBeNull();
    expect(leaving.messages.filter((message) => message.type === 'identity').at(-1).seat).toBeNull();
  });

  it('P6: 판 종료 snapshot은 phase를 유지하고 host title 퇴장은 입장순 승계하며 성립 불가일 때만 lobby로 간다', async () => {
    const { room, values } = roomHarness();
    const host = relaySocket('host');
    const guest = relaySocket('guest');
    const third = relaySocket('third');
    await room.attach(host, 'device-key-host', '방장');
    await room.attach(guest, 'device-key-guest', '손님');
    await room.attach(third, 'device-key-third', '셋째');
    values.room.phase = 'play';
    values.room.participants.forEach((person) => { person.ready = true; });
    await room.webSocketMessage(host, JSON.stringify({ type: 'snapshot', state: { winner: 1 } }));
    expect(values.room.phase).toBe('play');

    const hostId = host.deserializeAttachment().id;
    const guestId = guest.deserializeAttachment().id;
    const thirdId = third.deserializeAttachment().id;
    expect(applyRoomCommand(values.room, hostId, { command: 'leave-room' })).toBe(true);
    expect(values.room).toMatchObject({ hostId: guestId, phase: 'play' });
    expect(applyRoomCommand(values.room, guestId, { command: 'leave-room' })).toBe(true);
    expect(values.room).toMatchObject({ hostId: thirdId, phase: 'lobby', participants: [{ id: thirdId, ready: false }] });
    expect(applyRoomCommand(values.room, thirdId, { command: 'leave-room' })).toBe(true);
    expect(values.room).toMatchObject({ hostId: null, phase: 'lobby', participants: [] });
  });
});
