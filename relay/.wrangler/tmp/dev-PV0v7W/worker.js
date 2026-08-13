var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var ROOM_CODE = /^[A-HJ-KM-NP-Z]{3}-[0-9]{2}$/;
var RECONNECT_KEY = /^[A-Za-z0-9_-]{16,128}$/;
var HEARTBEAT_MS = 2e4;
var STALE_MS = 6e4;
var RESERVATION_MS = 3e4;
var TEAM_PAIRS = [["\uCF5C\uB77C", "\uC0AC\uC774\uB2E4"], ["\uC9DC\uC7A5", "\uC9EC\uBF55"], ["\uBD80\uBA39", "\uCC0D\uBA39"], ["\uC778\uB3C4\uC5B4", "\uC544\uC6C3\uB3C4\uC5B4"]];
var activeWebSockets = /* @__PURE__ */ __name((sockets) => sockets.filter((socket) => socket.readyState === 1), "activeWebSockets");
function lowestFreeSeat(sockets) {
  const occupied = new Set(sockets.map((socket) => socket.deserializeAttachment()?.seat));
  return !occupied.has(1) ? 1 : !occupied.has(2) ? 2 : null;
}
__name(lowestFreeSeat, "lowestFreeSeat");
var teamSeat = /* @__PURE__ */ __name((slot) => slot % 2 ? 1 : 2, "teamSeat");
var roomSeat = /* @__PURE__ */ __name((room, person) => person ? room.settings?.aiOpponent ? 1 : teamSeat(person.slot) : null, "roomSeat");
var requiredReady = /* @__PURE__ */ __name((total) => [0, 0, 2, 2, 3, 3, 4][total] ?? Infinity, "requiredReady");
var canContinue = /* @__PURE__ */ __name((room) => room.settings?.aiOpponent ? room.participants.length > 0 : [1, 2].every((team) => room.participants.some((person) => teamSeat(person.slot) === team)), "canContinue");
function resetLobby(room) {
  room.phase = "lobby";
  for (const person of room.participants) person.ready = false;
}
__name(resetLobby, "resetLobby");
function leaveRoom(room, sender) {
  room.participants = room.participants.filter((person) => person.id !== sender);
  if (room.hostId === sender) room.hostId = room.participants[0]?.id ?? null;
  if (room.phase === "play" && !canContinue(room)) resetLobby(room);
}
__name(leaveRoom, "leaveRoom");
function newRoom(code) {
  const pair = TEAM_PAIRS[Math.floor(Math.random() * TEAM_PAIRS.length)];
  return { code, participants: [], hostId: null, game: "samok", teamNames: [...pair], settings: { aiOpponent: false }, phase: "lobby" };
}
__name(newRoom, "newRoom");
function participant(room, id) {
  return room.participants.find((person) => person.id === id);
}
__name(participant, "participant");
function applyRoomCommand(room, sender, message) {
  const actor = participant(room, sender);
  if (!actor) return false;
  if (message.command === "return-lobby") {
    if (sender === room.hostId) resetLobby(room);
    else leaveRoom(room, sender);
    return true;
  }
  if (message.command === "leave-room") {
    leaveRoom(room, sender);
    return true;
  }
  if (message.command === "ready" && room.phase === "lobby" && sender !== room.hostId) {
    actor.ready = !actor.ready;
    return true;
  }
  if (sender !== room.hostId) return false;
  if (message.command === "set-ai-opponent" && typeof message.enabled === "boolean") {
    room.settings = { ...room.settings ?? {}, aiOpponent: message.enabled };
    return true;
  }
  if (message.command === "select-game" && typeof message.game === "string" && message.game.length <= 32) {
    room.game = message.game;
    return true;
  }
  if (message.command === "start") {
    const ready = 1 + room.participants.filter((person) => person.id !== room.hostId && person.ready).length;
    const bothTeams = [1, 2].every((team) => room.participants.some((person) => teamSeat(person.slot) === team));
    if (room.phase !== "lobby" || ready < requiredReady(room.participants.length) || !room.settings?.aiOpponent && !bothTeams) return false;
    room.phase = "play";
    return true;
  }
  const target = participant(room, message.target);
  if (message.command === "kick" && target && target.id !== room.hostId) {
    room.participants = room.participants.filter((person) => person !== target);
    return true;
  }
  if (message.command === "promote" && target) {
    room.hostId = target.id;
    return true;
  }
  if (message.command === "move" && target && room.phase === "lobby" && Number.isInteger(message.slot) && message.slot >= 1 && message.slot <= 6) {
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
  if (message.command === "team-name" && [1, 2].includes(message.team) && typeof message.name === "string" && message.name.trim() && message.name.length <= 24) {
    room.teamNames[message.team - 1] = message.name.trim();
    return true;
  }
  return false;
}
__name(applyRoomCommand, "applyRoomCommand");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const code = /^\/room\/([^/]+)$/.exec(url.pathname)?.[1]?.toUpperCase();
    if (!code || !ROOM_CODE.test(code)) return new Response("Invalid room code", { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  }
};
var Room = class {
  static {
    __name(this, "Room");
  }
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    const url = new URL(request.url);
    const reconnectKey = url.searchParams.get("reconnectKey");
    if (request.method === "POST") return this.reserve();
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket required", { status: 426 });
    if (!reconnectKey || !RECONNECT_KEY.test(reconnectKey)) return new Response("Reconnect key required", { status: 400 });
    const pair = new WebSocketPair();
    await this.attach(pair[1], reconnectKey, url.searchParams.get("name") ?? "\uD50C\uB808\uC774\uC5B4", url.pathname.split("/").pop());
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async attach(server, reconnectKey, rawName = "\uD50C\uB808\uC774\uC5B4", code = "ABC-67") {
    return this.state.blockConcurrencyWhile(async () => {
      const existing = activeWebSockets(this.state.getWebSockets());
      const replaced = existing.filter((socket) => socket.deserializeAttachment()?.reconnectKey === reconnectKey);
      const stored = await this.state.storage.get(["room", "snapshot", "seq", "authority"]);
      const room = stored.get("room") ?? newRoom(code);
      room.settings ??= { aiOpponent: false };
      let person = room.participants.find((item) => item.reconnectKey === reconnectKey);
      if (!person && room.participants.length < 6) {
        const slot = [1, 2, 3, 4, 5, 6].find((value) => !room.participants.some((item) => item.slot === value));
        person = { id: replaced[0]?.deserializeAttachment()?.id ?? crypto.randomUUID(), reconnectKey, slot, name: rawName.trim().slice(0, 16) || "\uD50C\uB808\uC774\uC5B4", ready: false };
        room.participants.push(person);
        room.hostId ??= person.id;
      }
      for (const socket of replaced) {
        socket.serializeAttachment({ ...socket.deserializeAttachment() ?? {}, seat: null });
        socket.close(4001, "Replaced connection");
      }
      const id = person?.id ?? crypto.randomUUID();
      const seat = roomSeat(room, person);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ id, reconnectKey, seat, lastSeen: Date.now() });
      const sockets = activeWebSockets(this.state.getWebSockets());
      const ids = sockets.map((socket) => socket.deserializeAttachment()?.id);
      const savedAuthority = stored.get("authority");
      const authority = savedAuthority && ids.includes(savedAuthority) ? savedAuthority : id;
      await this.state.storage.put({ room, authority, updatedAt: Date.now() });
      server.send(JSON.stringify({ type: "identity", id, authority, seat }));
      if (stored.has("snapshot")) server.send(JSON.stringify({ type: "snapshot", state: stored.get("snapshot"), seq: stored.get("seq") ?? 0 }));
      this.broadcast({ type: "authority", authority });
      await this.emitRoom(room);
      this.broadcast({ type: "peers", count: sockets.length });
      await this.state.storage.setAlarm(Date.now() + HEARTBEAT_MS);
      return { id, seat };
    });
  }
  async reserve() {
    const reserved = await this.state.blockConcurrencyWhile(async () => {
      const now = Date.now();
      if (this.state.getWebSockets().length || Number(await this.state.storage.get("reservedUntil") ?? 0) > now) return false;
      await this.state.storage.put({ reservedUntil: now + RESERVATION_MS, updatedAt: now });
      return true;
    });
    return new Response(reserved ? "Reserved" : "Occupied", { status: reserved ? 201 : 409, headers: { "Access-Control-Allow-Origin": "*" } });
  }
  async webSocketMessage(socket, raw) {
    let message;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      return;
    }
    const attachment = socket.deserializeAttachment() ?? {};
    socket.serializeAttachment({ ...attachment, lastSeen: Date.now() });
    if (message.type === "heartbeat") {
      socket.send(JSON.stringify({ type: "heartbeat", at: Date.now() }));
      return;
    }
    const sender = attachment.id;
    if (message.type === "room-command") {
      const room = await this.state.storage.get("room");
      if (!room || !applyRoomCommand(room, sender, message)) {
        socket.send(JSON.stringify({ type: "room-error", message: "\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 \uBC29 \uBA85\uB839" }));
        return;
      }
      await this.state.storage.put({ room, updatedAt: Date.now() });
      await this.syncSeats(room);
      if (!participant(room, sender)) await this.reassignAuthority(socket, room);
      if (message.command === "kick") this.closeParticipant(message.target);
      await this.emitRoom(room);
      return;
    }
    const authority = await this.state.storage.get("authority");
    if (message.type === "action") {
      const target = activeWebSockets(this.state.getWebSockets()).find((candidate) => candidate.deserializeAttachment()?.id === authority);
      if (target) target.send(JSON.stringify({ ...message, from: sender, actor: { id: sender, seat: attachment.seat ?? null } }));
      return;
    }
    if (message.type === "snapshot" && message.state !== void 0 && sender === authority) {
      const seq = Number(await this.state.storage.get("seq") ?? 0) + 1;
      await this.state.storage.put({ snapshot: message.state, seq, updatedAt: Date.now() });
      this.broadcast({ ...message, type: "snapshot", state: message.state, seq });
    }
  }
  async webSocketClose(socket) {
    socket.serializeAttachment({ ...socket.deserializeAttachment() ?? {}, seat: null });
    const room = await this.state.storage.get("room");
    await this.reassignAuthority(socket, room);
    if (room) await this.emitRoom(room);
  }
  async webSocketError(socket) {
    socket.serializeAttachment({ ...socket.deserializeAttachment() ?? {}, seat: null });
    socket.close(1011, "Socket error");
    await this.reassignAuthority(socket);
  }
  async alarm() {
    const now = Date.now();
    for (const socket of activeWebSockets(this.state.getWebSockets())) if (now - (socket.deserializeAttachment()?.lastSeen ?? 0) >= STALE_MS) socket.close(4e3, "Stale seat");
    const sockets = activeWebSockets(this.state.getWebSockets());
    this.broadcast({ type: "peers", count: sockets.length });
    if (sockets.length) await this.state.storage.setAlarm(now + HEARTBEAT_MS);
  }
  async emitRoom(room) {
    const present = new Set(activeWebSockets(this.state.getWebSockets()).map((socket) => socket.deserializeAttachment()?.id));
    const participants = room.participants.map(({ reconnectKey: _, ...person }) => ({ ...person, present: present.has(person.id) }));
    this.broadcast({ type: "room", room: { ...room, participants } });
  }
  closeParticipant(id) {
    for (const socket of activeWebSockets(this.state.getWebSockets())) if (socket.deserializeAttachment()?.id === id) socket.close(4003, "Removed from room");
  }
  async syncSeats(room) {
    const authority = await this.state.storage.get("authority");
    for (const socket of activeWebSockets(this.state.getWebSockets())) {
      const attachment = socket.deserializeAttachment() ?? {};
      const person = participant(room, attachment.id);
      const seat = roomSeat(room, person);
      if (seat === attachment.seat) continue;
      socket.serializeAttachment({ ...attachment, seat });
      socket.send(JSON.stringify({ type: "identity", id: attachment.id, authority, seat }));
    }
  }
  broadcast(message) {
    const encoded = JSON.stringify(message);
    for (const socket of activeWebSockets(this.state.getWebSockets())) try {
      socket.send(encoded);
    } catch {
      socket.close(1011, "Send failed");
    }
  }
  async reassignAuthority(excludedSocket, room) {
    const sockets = activeWebSockets(this.state.getWebSockets());
    const members = room && new Set(room.participants.map((person) => person.id));
    const eligible = sockets.filter((socket) => socket !== excludedSocket && (!members || members.has(socket.deserializeAttachment()?.id)));
    const ids = eligible.map((socket) => socket.deserializeAttachment()?.id);
    const saved = await this.state.storage.get("authority");
    const authority = saved && ids.includes(saved) ? saved : ids[0] ?? null;
    await this.state.storage.put({ authority, updatedAt: Date.now() });
    this.broadcast({ type: "authority", authority });
    this.broadcast({ type: "peers", count: sockets.length });
  }
};

// ../../../Users/apple/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../Users/apple/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-dC2BMD/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../Users/apple/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-dC2BMD/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Room,
  TEAM_PAIRS,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  activeWebSockets,
  applyRoomCommand,
  middleware_loader_entry_default as default,
  lowestFreeSeat,
  requiredReady,
  roomSeat,
  teamSeat
};
//# sourceMappingURL=worker.js.map
