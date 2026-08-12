import { describe, expect, it } from 'vitest';
import { Room } from '../../relay/worker.js';
import { samok } from './samok';
import { reduceAuthorityVote, settleTeamVote } from './team-vote';

function relaySocket() {
  let attachment = {};
  return {
    readyState: 1,
    messages: [],
    deserializeAttachment: () => attachment,
    serializeAttachment: (value) => { attachment = value; },
    send(raw) { this.messages.push(JSON.parse(raw)); },
    close() { this.readyState = 3; },
  };
}

function harness() {
  const sockets = [];
  const values = {};
  const storage = {
    async get(key) {
      if (Array.isArray(key)) return new Map(key.filter((name) => Object.hasOwn(values, name)).map((name) => [name, values[name]]));
      return values[key];
    },
    async put(value) { Object.assign(values, value); },
    async setAlarm() {},
  };
  const state = { storage, getWebSockets: () => sockets, acceptWebSocket(socket) { sockets.push(socket); }, blockConcurrencyWhile(callback) { return callback(); } };
  return { room: new Room(state), values };
}

describe('L6 INTEGRATION: opaque action → authority snapshot → identical consumers', () => {
  it('비권위 vote와 forged actor는 snapshot을 못 바꾸고 권위의 단일 선택만 두 소비자에게 동일 전파된다', async () => {
    const { room, values } = harness();
    const authority = relaySocket();
    const opponent = relaySocket();
    const teammate = relaySocket();
    await room.attach(authority, 'device-key-authority', '권위');
    await room.attach(opponent, 'device-key-opponent', '상대');
    await room.attach(teammate, 'device-key-teammate', '팀원');
    authority.messages.length = 0;
    opponent.messages.length = 0;
    teammate.messages.length = 0;

    await room.webSocketMessage(teammate, JSON.stringify({ type: 'action', action: { type: 'vote', column: 1 }, actor: { id: 'forged', seat: 2 } }));
    expect(values.snapshot).toBeUndefined();
    const forwarded = authority.messages.find((message) => message.type === 'action');
    expect(forwarded).toMatchObject({ action: { type: 'vote', column: 1 }, actor: { id: teammate.deserializeAttachment().id, seat: 1 } });

    await room.webSocketMessage(teammate, JSON.stringify({ type: 'snapshot', state: { forged: true } }));
    expect(values.snapshot).toBeUndefined();
    const members = [authority, teammate].map((socket) => ({ id: socket.deserializeAttachment().id, team: 1 }));
    let state = reduceAuthorityVote(samok.init(), forwarded.action.column, forwarded.actor, members, true, 0, () => 0);
    state = reduceAuthorityVote(state, 5, authority.deserializeAttachment(), members, true, 1, () => 0);
    state = settleTeamVote(state, members, 5_001, () => 0.99);
    await room.webSocketMessage(authority, JSON.stringify({ type: 'snapshot', state }));

    const opponentSnapshot = opponent.messages.findLast((message) => message.type === 'snapshot');
    const teammateSnapshot = teammate.messages.findLast((message) => message.type === 'snapshot');
    expect(values.snapshot.moves).toBe(1);
    expect(opponentSnapshot.state).toEqual(teammateSnapshot.state);
    expect(opponentSnapshot.state.resolvedVote).toEqual({ turn: 1, selected: 5, presentation: [5, 1], settledAt: 5_001 });
  });
});
