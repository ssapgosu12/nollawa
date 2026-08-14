const ROOM_CODE = /^[A-HJ-KM-NP-Z]{3}-[0-9]{2}$/;
const RECONNECT_KEY = /^[A-Za-z0-9_-]{16,128}$/;
const HEARTBEAT_MS = 20_000;
const STALE_MS = 60_000;
const RESERVATION_MS = 30_000;
const BOARD_SIZES = [13, 15, 19];
export const TEAM_PAIRS = [['콜라', '사이다'], ['짜장', '짬뽕'], ['부먹', '찍먹'], ['인도어', '아웃도어']];

export const activeWebSockets = (sockets) => sockets.filter((socket) => socket.readyState === 1);
export function lowestFreeSeat(sockets) {
  const occupied = new Set(sockets.map((socket) => socket.deserializeAttachment()?.seat));
  return !occupied.has(1) ? 1 : !occupied.has(2) ? 2 : null;
}
export const teamSeat = (slot) => slot % 2 ? 1 : 2;
export const roomSeat = (room, person) => person && (room.phase !== 'play' || person.activity === 'play') ? room.settings?.aiOpponent ? 1 : teamSeat(person.slot) : null;
export const requiredReady = (total) => [0, 0, 2, 2, 3, 3, 4][total] ?? Infinity;
const canContinue = (room) => room.settings?.aiOpponent ? room.participants.length > 0 : [1, 2].every((team) => room.participants.some((person) => teamSeat(person.slot) === team));

function resetLobby(room) {
  room.phase = 'lobby';
  for (const person of room.participants) { person.ready = false; person.activity = 'lobby'; }
}

function leaveRoom(room, sender) {
  room.participants = room.participants.filter((person) => person.id !== sender);
  if (room.hostId === sender) room.hostId = room.participants[0]?.id ?? null;
  if (room.phase === 'play' && !canContinue(room)) resetLobby(room);
}

function newRoom(code) {
  const pair = TEAM_PAIRS[Math.floor(Math.random() * TEAM_PAIRS.length)];
  return { code, participants: [], hostId: null, game: 'samok', teamNames: [...pair], settings: { aiOpponent: false, aiStrength: 'normal', boardSize: 13 }, phase: 'lobby' };
}

function participant(room, id) {
  return room.participants.find((person) => person.id === id);
}

export function applyRoomCommand(room, sender, message) {
  const actor = participant(room, sender);
  if (!actor) return false;
  if (message.command === 'return-lobby') {
    if (sender === room.hostId) resetLobby(room);
    else leaveRoom(room, sender);
    return true;
  }
  if (message.command === 'leave-room') {
    leaveRoom(room, sender);
    return true;
  }
  if (message.command === 'ready' && room.phase === 'lobby' && sender !== room.hostId) {
    actor.ready = !actor.ready;
    return true;
  }
  if (message.command === 'set-activity' && actor.activity !== 'play' && ['lobby', 'games'].includes(message.activity)) {
    actor.activity = message.activity;
    return true;
  }
  if (sender !== room.hostId) return false;
  if (message.command === 'set-ai-opponent' && typeof message.enabled === 'boolean') {
    room.settings = { ...(room.settings ?? {}), aiOpponent: message.enabled };
    return true;
  }
  if (message.command === 'set-ai-strength' && ['normal', 'high'].includes(message.strength)) {
    room.settings = { ...(room.settings ?? {}), aiStrength: message.strength };
    return true;
  }
  if (message.command === 'set-board-size' && room.phase === 'lobby' && ['omok', 'yukmok'].includes(room.game) && BOARD_SIZES.includes(message.size)) {
    room.settings = { ...(room.settings ?? {}), boardSize: message.size };
    return true;
  }
  if (message.command === 'select-game' && typeof message.game === 'string' && message.game.length <= 32) {
    room.game = message.game;
    actor.activity = 'lobby';
    return true;
  }
  if (message.command === 'start') {
    const ready = 1 + room.participants.filter((person) => person.id !== room.hostId && person.ready).length;
    const bothTeams = [1, 2].every((team) => room.participants.some((person) => teamSeat(person.slot) === team));
    if (room.phase !== 'lobby' || ready < requiredReady(room.participants.length) || (!room.settings?.aiOpponent && !bothTeams)) return false;
    room.phase = 'play';
    for (const person of room.participants) person.activity = 'play';
    return true;
  }
  const target = participant(room, message.target);
  if (message.command === 'kick' && target && target.id !== room.hostId) {
    room.participants = room.participants.filter((person) => person !== target);
    return true;
  }
  if (message.command === 'promote' && target) {
    room.hostId = target.id;
    return true;
  }
  if (message.command === 'move' && target && room.phase === 'lobby' && Number.isInteger(message.slot) && message.slot >= 1 && message.slot <= 6) {
    const occupant = room.participants.find((person) => person.slot === message.slot);
    const oldSlot = target.slot;
    target.slot = message.slot;
    target.ready = false;
    if (occupant && occupant !== target) {
      occupant.slot = oldSlot;
      occupant.ready = false;
    }
    return true;
  }
  if (message.command === 'team-name' && [1, 2].includes(message.team) && typeof message.name === 'string' && message.name.trim() && message.name.length <= 24) {
    room.teamNames[message.team - 1] = message.name.trim();
    return true;
  }
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const code = /^\/room\/([^/]+)$/.exec(url.pathname)?.[1]?.toUpperCase();
    if (!code || !ROOM_CODE.test(code)) return new Response('Invalid room code', { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};

export class Room {
  constructor(state) { this.state = state; }

  async fetch(request) {
    const url = new URL(request.url);
    const reconnectKey = url.searchParams.get('reconnectKey');
    if (request.method === 'POST') return this.reserve();
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });
    if (!reconnectKey || !RECONNECT_KEY.test(reconnectKey)) return new Response('Reconnect key required', { status: 400 });
    const pair = new WebSocketPair();
    await this.attach(pair[1], reconnectKey, url.searchParams.get('name') ?? '플레이어', url.pathname.split('/').pop());
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async attach(server, reconnectKey, rawName = '플레이어', code = 'ABC-67') {
    return this.state.blockConcurrencyWhile(async () => {
      const existing = activeWebSockets(this.state.getWebSockets());
      const replaced = existing.filter((socket) => socket.deserializeAttachment()?.reconnectKey === reconnectKey);
      const stored = await this.state.storage.get(['room', 'snapshot', 'snapshotGame', 'seq', 'authority']);
      const room = stored.get('room') ?? newRoom(code);
      room.settings = { aiOpponent: room.settings?.aiOpponent === true, aiStrength: room.settings?.aiStrength === 'high' ? 'high' : 'normal', boardSize: BOARD_SIZES.includes(room.settings?.boardSize) ? room.settings.boardSize : 13 };
      for (const member of room.participants) member.activity ??= room.phase === 'play' ? 'play' : 'lobby';
      let person = room.participants.find((item) => item.reconnectKey === reconnectKey);
      if (!person && room.participants.length < 6) {
        const slot = [1, 2, 3, 4, 5, 6].find((value) => !room.participants.some((item) => item.slot === value));
        person = { id: replaced[0]?.deserializeAttachment()?.id ?? crypto.randomUUID(), reconnectKey, slot, name: rawName.trim().slice(0, 16) || '플레이어', ready: false, activity: 'lobby' };
        room.participants.push(person);
        room.hostId ??= person.id;
      }
      for (const socket of replaced) {
        socket.serializeAttachment({ ...(socket.deserializeAttachment() ?? {}), seat: null });
        socket.close(4001, 'Replaced connection');
      }
      const id = person?.id ?? crypto.randomUUID();
      const seat = roomSeat(room, person);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ id, reconnectKey, seat, lastSeen: Date.now() });
      const sockets = activeWebSockets(this.state.getWebSockets());
      const ids = sockets.map((socket) => socket.deserializeAttachment()?.id);
      const savedAuthority = stored.get('authority');
      const authority = savedAuthority && ids.includes(savedAuthority) ? savedAuthority : id;
      await this.state.storage.put({ room, authority, updatedAt: Date.now() });
      server.send(JSON.stringify({ type: 'identity', id, authority, seat }));
      if (stored.has('snapshot')) server.send(JSON.stringify({ type: 'snapshot', game: stored.get('snapshotGame'), state: stored.get('snapshot'), seq: stored.get('seq') ?? 0 }));
      this.broadcast({ type: 'authority', authority });
      await this.emitRoom(room);
      this.broadcast({ type: 'peers', count: sockets.length });
      await this.state.storage.setAlarm(Date.now() + HEARTBEAT_MS);
      return { id, seat };
    });
  }

  async reserve() {
    const reserved = await this.state.blockConcurrencyWhile(async () => {
      const now = Date.now();
      if (this.state.getWebSockets().length || Number(await this.state.storage.get('reservedUntil') ?? 0) > now) return false;
      await this.state.storage.put({ reservedUntil: now + RESERVATION_MS, updatedAt: now });
      return true;
    });
    return new Response(reserved ? 'Reserved' : 'Occupied', { status: reserved ? 201 : 409, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  async webSocketMessage(socket, raw) {
    let message;
    try { message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); }
    catch { socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' })); return; }
    const attachment = socket.deserializeAttachment() ?? {};
    socket.serializeAttachment({ ...attachment, lastSeen: Date.now() });
    if (message.type === 'heartbeat') { socket.send(JSON.stringify({ type: 'heartbeat', at: Date.now() })); return; }
    const sender = attachment.id;
    if (message.type === 'room-command') {
      const room = await this.state.storage.get('room');
      if (!room || !applyRoomCommand(room, sender, message)) { socket.send(JSON.stringify({ type: 'room-error', message: '허용되지 않은 방 명령' })); return; }
      await this.state.storage.put({ room, updatedAt: Date.now() });
      await this.syncSeats(room);
      if (!participant(room, sender)) await this.reassignAuthority(socket, room);
      if (message.command === 'kick') this.closeParticipant(message.target);
      await this.emitRoom(room);
      return;
    }
    const authority = await this.state.storage.get('authority');
    if (message.type === 'action') {
      const target = activeWebSockets(this.state.getWebSockets()).find((candidate) => candidate.deserializeAttachment()?.id === authority);
      if (target) target.send(JSON.stringify({ ...message, from: sender, actor: { id: sender, seat: attachment.seat ?? null } }));
      return;
    }
    if (message.type === 'snapshot' && message.state !== undefined && sender === authority) {
      const seq = Number(await this.state.storage.get('seq') ?? 0) + 1;
      await this.state.storage.put({ snapshot: message.state, snapshotGame: message.game, seq, updatedAt: Date.now() });
      this.broadcast({ ...message, type: 'snapshot', state: message.state, seq });
    }
  }

  async webSocketClose(socket) {
    socket.serializeAttachment({ ...(socket.deserializeAttachment() ?? {}), seat: null });
    const room = await this.state.storage.get('room');
    await this.reassignAuthority(socket, room);
    if (room) await this.emitRoom(room);
  }

  async webSocketError(socket) {
    socket.serializeAttachment({ ...(socket.deserializeAttachment() ?? {}), seat: null });
    socket.close(1011, 'Socket error');
    await this.reassignAuthority(socket);
  }

  async alarm() {
    const now = Date.now();
    for (const socket of activeWebSockets(this.state.getWebSockets())) if (now - (socket.deserializeAttachment()?.lastSeen ?? 0) >= STALE_MS) socket.close(4000, 'Stale seat');
    const sockets = activeWebSockets(this.state.getWebSockets());
    this.broadcast({ type: 'peers', count: sockets.length });
    if (sockets.length) await this.state.storage.setAlarm(now + HEARTBEAT_MS);
  }

  async emitRoom(room) {
    const present = new Set(activeWebSockets(this.state.getWebSockets()).map((socket) => socket.deserializeAttachment()?.id));
    const participants = room.participants.map(({ reconnectKey: _, ...person }) => ({ ...person, present: present.has(person.id) }));
    this.broadcast({ type: 'room', room: { ...room, participants } });
  }

  closeParticipant(id) {
    for (const socket of activeWebSockets(this.state.getWebSockets())) if (socket.deserializeAttachment()?.id === id) socket.close(4003, 'Removed from room');
  }

  async syncSeats(room) {
    const authority = await this.state.storage.get('authority');
    for (const socket of activeWebSockets(this.state.getWebSockets())) {
      const attachment = socket.deserializeAttachment() ?? {};
      const person = participant(room, attachment.id);
      const seat = roomSeat(room, person);
      if (seat === attachment.seat) continue;
      socket.serializeAttachment({ ...attachment, seat });
      socket.send(JSON.stringify({ type: 'identity', id: attachment.id, authority, seat }));
    }
  }

  broadcast(message) {
    const encoded = JSON.stringify(message);
    for (const socket of activeWebSockets(this.state.getWebSockets())) try { socket.send(encoded); } catch { socket.close(1011, 'Send failed'); }
  }

  async reassignAuthority(excludedSocket, room) {
    const sockets = activeWebSockets(this.state.getWebSockets());
    const members = room && new Set(room.participants.map((person) => person.id));
    const eligible = sockets.filter((socket) => socket !== excludedSocket && (!members || members.has(socket.deserializeAttachment()?.id)));
    const ids = eligible.map((socket) => socket.deserializeAttachment()?.id);
    const saved = await this.state.storage.get('authority');
    const authority = saved && ids.includes(saved) ? saved : ids[0] ?? null;
    await this.state.storage.put({ authority, updatedAt: Date.now() });
    this.broadcast({ type: 'authority', authority });
    this.broadcast({ type: 'peers', count: sockets.length });
  }
}
