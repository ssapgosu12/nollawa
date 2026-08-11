const ROOM_CODE = /^[A-HJ-KM-NP-Z]{3}-[0-9]{2}$/;
const HEARTBEAT_MS = 20_000;
const STALE_MS = 60_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = /^\/room\/([^/]+)$/.exec(url.pathname);
    const code = match?.[1]?.toUpperCase();
    if (!code || !ROOM_CODE.test(code)) return new Response('Invalid room code', { status: 400 });
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    return room.fetch(request);
  },
};

export class Room {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const existing = this.state.getWebSockets();
    const id = crypto.randomUUID();
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id, lastSeen: Date.now() });
    const saved = await this.state.storage.get(['snapshot', 'seq', 'authority']);
    const sockets = this.state.getWebSockets();
    const activeIds = existing.map((socket) => socket.deserializeAttachment()?.id);
    const savedAuthority = saved.get('authority');
    const authority = savedAuthority && activeIds.includes(savedAuthority) ? savedAuthority : id;
    await this.state.storage.put({ authority, updatedAt: Date.now() });
    server.send(JSON.stringify({ type: 'identity', id, authority }));
    if (saved.has('snapshot')) server.send(JSON.stringify({ type: 'snapshot', state: saved.get('snapshot'), seq: saved.get('seq') ?? 0 }));
    this.broadcast({ type: 'authority', authority });
    this.broadcast({ type: 'peers', count: sockets.length });
    await this.state.storage.setAlarm(Date.now() + HEARTBEAT_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, raw) {
    let message;
    try { message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); }
    catch { socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' })); return; }
    socket.serializeAttachment({ ...(socket.deserializeAttachment() ?? {}), lastSeen: Date.now() });
    if (message.type === 'heartbeat') {
      socket.send(JSON.stringify({ type: 'heartbeat', at: Date.now() }));
      return;
    }
    const sender = socket.deserializeAttachment()?.id;
    const authority = await this.state.storage.get('authority');
    if (message.type === 'action') {
      const authoritySocket = this.state.getWebSockets().find((candidate) => candidate.deserializeAttachment()?.id === authority);
      if (authoritySocket) authoritySocket.send(JSON.stringify({ ...message, from: sender }));
      return;
    }
    if (message.type === 'snapshot' && message.state !== undefined && sender === authority) {
      const seq = Number(await this.state.storage.get('seq') ?? 0) + 1;
      await this.state.storage.put({ snapshot: message.state, seq, updatedAt: Date.now() });
      this.broadcast({ type: 'snapshot', state: message.state, seq });
      return;
    }
  }

  async webSocketClose() {
    this.broadcast({ type: 'peers', count: this.state.getWebSockets().length });
    await this.reassignAuthority();
  }

  async webSocketError() {
    await this.reassignAuthority();
  }

  async alarm() {
    const now = Date.now();
    for (const socket of this.state.getWebSockets()) {
      const lastSeen = socket.deserializeAttachment()?.lastSeen ?? 0;
      if (now - lastSeen >= STALE_MS) socket.close(4000, 'Stale seat');
    }
    const sockets = this.state.getWebSockets();
    this.broadcast({ type: 'peers', count: sockets.length });
    if (sockets.length) await this.state.storage.setAlarm(now + HEARTBEAT_MS);
  }

  broadcast(message) {
    const encoded = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      try { socket.send(encoded); } catch { socket.close(1011, 'Send failed'); }
    }
  }

  async reassignAuthority() {
    const sockets = this.state.getWebSockets();
    const authority = sockets[0]?.deserializeAttachment()?.id ?? null;
    await this.state.storage.put({ authority, updatedAt: Date.now() });
    this.broadcast({ type: 'authority', authority });
  }
}
