import { h, render } from 'preact';
import { describe, expect, it } from 'vitest';
import { FleetGame } from './components/FleetGame';
import { RoomLobby } from './lobby/RoomLobby';
import { GAME_CATALOG } from './game/catalog';
import {
  CLASSIC_FLEET_LENGTHS,
  createFleetState,
  createVariantFleetState,
  isFleetState,
  reduceFleet,
  type FleetState,
} from './game/fleet';
import { canStartRoom, lobbyAction, type RoomSnapshot } from './lobby/room-state';
import { Room } from '../relay/worker.js';

type Listener = (event: { type: string; currentTarget: FakeElement }) => void;

class FakeNode {
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  ownerDocument: FakeDocument;
  nodeType: number;
  nodeName: string;
  data = '';
  constructor(ownerDocument: FakeDocument, nodeType: number, nodeName: string, data = '') {
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.data = data;
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }
  get nodeValue() { return this.nodeType === 3 ? this.data : null; }
  set nodeValue(value: string | null) { if (this.nodeType === 3) this.data = value ?? ''; }
  appendChild<T extends FakeNode>(node: T): T { return this.insertBefore(node, null); }
  insertBefore<T extends FakeNode>(node: T, before: FakeNode | null): T {
    node.parentNode?.removeChild(node);
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) this.childNodes.push(node); else this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }
  removeChild<T extends FakeNode>(node: T): T {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }
}

class FakeElement extends FakeNode {
  localName: string;
  attributes = new Map<string, string>();
  listeners = new Map<string, Listener>();
  style = { cssText: '', setProperty: (_name: string, _value: string) => undefined };
  disabled = false;
  className = '';
  value = '';
  checked = false;
  constructor(ownerDocument: FakeDocument, name: string) {
    super(ownerDocument, 1, name.toUpperCase());
    this.localName = name;
  }
  setAttribute(name: string, value: unknown) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'class') this.className = text;
  }
  removeAttribute(name: string) { this.attributes.delete(name); }
  getAttribute(name: string) { return name === 'class' ? this.className || null : this.attributes.get(name) ?? null; }
  addEventListener(type: string, listener: Listener) { this.listeners.set(type, listener); }
  removeEventListener(type: string) { this.listeners.delete(type); }
  dispatch(type: string) { this.listeners.get(type)?.({ type, currentTarget: this }); }
}

class FakeDocument {
  createElement(name: string) { return new FakeElement(this, name); }
  createElementNS(_namespace: string, name: string) { return this.createElement(name); }
  createTextNode(data: string) { return new FakeNode(this, 3, '#text', data); }
}

const documentShim = new FakeDocument();
Object.assign(globalThis, {
  document: documentShim,
  window: { setTimeout, clearTimeout },
});

const people = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `${index + 1}P` }));

function placeClassic(state: FleetState): FleetState {
  let next = state;
  for (const participant of state.participants) {
    CLASSIC_FLEET_LENGTHS.forEach((_length, shipIndex) => {
      next = reduceFleet(next, participant.id, { type: 'place-ship', shipIndex, origin: { row: shipIndex, column: 0 }, orientation: 'horizontal' });
    });
    next = reduceFleet(next, participant.id, { type: 'complete-placement' });
  }
  return next;
}

function completeClassic(): FleetState {
  let state = placeClassic(createFleetState(people(2)));
  const target = state.participants[1]!;
  const misses = Array.from({ length: state.boardSize * state.boardSize }, (_, index) => ({ row: Math.floor(index / state.boardSize), column: index % state.boardSize }))
    .filter((cell) => !state.participants[0]!.ships.some((ship) => ship.cells.some((candidate) => candidate.row === cell.row && candidate.column === cell.column)));
  for (const cell of target.ships.flatMap(({ cells }) => cells)) {
    state = reduceFleet(state, 'p1', { type: 'shoot', targetParticipantId: 'p2', cell, shotType: 'classic' });
    if (state.phase !== 'complete') {
      state = reduceFleet(state, 'p2', { type: 'shoot', targetParticipantId: 'p1', cell: misses.shift()!, shotType: 'classic' });
    }
  }
  return state;
}

function placeVariant(state: FleetState): FleetState {
  let next = state;
  for (const participant of next.participants) {
    const setup = next.participants.find(({ id }) => id === participant.id)!.variantSetup!;
    const preset = setup.presetOffers[0]!;
    next = reduceFleet(next, participant.id, { type: 'choose-variant-preset', presetId: preset.id });
    const choiceCount = next.participants.length === 2 ? 1 : 2;
    next = reduceFleet(next, participant.id, { type: 'choose-special-ships', specialShips: preset.specialShipOffers.slice(0, choiceCount) });
  }
  for (const participant of next.participants) {
    const fleet = next.participants.find(({ id }) => id === participant.id)!.variantSetup!.fleet;
    for (let shipIndex = 0; shipIndex < fleet.length; shipIndex += 1) {
      let placed = false;
      for (const orientation of ['horizontal', 'vertical'] as const) {
        for (let row = 0; row < next.boardSize && !placed; row += 1) {
          for (let column = 0; column < next.boardSize && !placed; column += 1) {
            const candidate = reduceFleet(next, participant.id, { type: 'place-ship', shipIndex, origin: { row, column }, orientation });
            if (candidate !== next) { next = candidate; placed = true; }
          }
        }
      }
      if (!placed) throw new Error(`could not place variant ship ${participant.id}:${shipIndex}`);
    }
    next = reduceFleet(next, participant.id, { type: 'complete-placement' });
  }
  return next;
}

function textOf(node: FakeNode): string {
  return node.nodeType === 3 ? node.data : node.childNodes.map(textOf).join(' ');
}

function elements(node: FakeNode): FakeElement[] {
  return node.childNodes.flatMap((child) => child instanceof FakeElement ? [child, ...elements(child)] : []);
}

function renderFleet(state: FleetState, viewerId: string): { text: string; labels: string[] } {
  const root = documentShim.createElement('div');
  render(h(FleetGame, { state, viewerId, onAction: () => undefined, onExit: () => undefined }), root as never);
  const labels = elements(root).map((element) => element.getAttribute('aria-label')).filter((value): value is string => Boolean(value));
  return { text: textOf(root).replace(/\s+/g, ' ').trim(), labels };
}

function room(game: 'fleet' | 'fleet-variant', count: number): RoomSnapshot {
  return {
    code: 'ABC-67', hostId: 'p1', game, teamNames: ['왼쪽', '오른쪽'], settings: { aiOpponent: false }, phase: 'lobby',
    participants: Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, slot: index + 1, name: `${index + 1}P`, ready: true, present: true })),
  };
}

function renderLobby(snapshot: RoomSnapshot): { text: string; startDisabled: boolean | undefined } {
  const root = documentShim.createElement('div');
  render(h(RoomLobby, { room: snapshot, selfId: 'p1', send: () => undefined, openGames: () => undefined }), root as never);
  const start = elements(root).find((element) => element.localName === 'button' && textOf(element).includes('플레이 시작'));
  return { text: textOf(root).replace(/\s+/g, ' ').trim(), startDisabled: start?.disabled };
}

function relaySocket() {
  let attachment: Record<string, unknown> = {};
  return {
    readyState: 1,
    messages: [] as Array<Record<string, unknown>>,
    deserializeAttachment: () => attachment,
    serializeAttachment: (value: Record<string, unknown>) => { attachment = value; },
    send(raw: string) { this.messages.push(JSON.parse(raw) as Record<string, unknown>); },
    close() { this.readyState = 3; },
  };
}

function relayHarness() {
  const sockets: ReturnType<typeof relaySocket>[] = [];
  const values: Record<string, unknown> = {};
  const storage = {
    async get(key: string | string[]) {
      if (Array.isArray(key)) return new Map(key.filter((name) => Object.hasOwn(values, name)).map((name) => [name, values[name]]));
      return values[key];
    },
    async put(value: Record<string, unknown>) { Object.assign(values, value); },
    async setAlarm() { return undefined; },
  };
  const state = { storage, getWebSockets: () => sockets, acceptWebSocket(socket: ReturnType<typeof relaySocket>) { sockets.push(socket); }, blockConcurrencyWhile(callback: () => unknown) { return callback(); } };
  return { relay: new Room(state as never) };
}

describe('M3-FLEET-SHELL-B dynamic reproduction harness', () => {
  it('B-28 observes local replacement, actual relay room-first order, stale render, and snapshot-first counter-order', async () => {
    const classicComplete = completeClassic();
    const variantSetup = createVariantFleetState(people(3), () => 0.25);
    expect(classicComplete).toMatchObject({ mode: 'classic', phase: 'complete', winnerId: 'p1' });
    expect(variantSetup).toMatchObject({ mode: 'variant', phase: 'setup' });

    const classicRender = renderFleet(classicComplete, 'p1');
    const localAfterVariantStart = renderFleet(variantSetup, 'p1');
    expect(classicRender.text).toContain('1P 승리');
    expect(localAfterVariantStart.labels).toContain('함대 격침 변형 설정');
    expect(localAfterVariantStart.text).toContain('프리셋');

    const roomPlayMessage = { type: 'room' as const, room: { ...room('fleet-variant', 3), phase: 'play' as const } };
    const variantSnapshot = { type: 'snapshot' as const, game: 'fleet-variant' as const, state: variantSetup };
    const { relay } = relayHarness();
    const host = relaySocket();
    const guest = relaySocket();
    await relay.attach(host as never, 'device-key-host-0001', '1P');
    await relay.attach(guest as never, 'device-key-guest-001', '2P');
    await relay.webSocketMessage(host as never, JSON.stringify({ type: 'room-command', command: 'select-game', game: 'fleet-variant' }));
    await relay.webSocketMessage(guest as never, JSON.stringify({ type: 'room-command', command: 'ready' }));
    host.messages.length = 0;
    guest.messages.length = 0;
    await relay.webSocketMessage(host as never, JSON.stringify({ type: 'room-command', command: 'start' }));
    await relay.webSocketMessage(host as never, JSON.stringify(variantSnapshot));
    const hostOrder = host.messages.filter(({ type }) => type === 'room' || type === 'snapshot').map(({ type }) => type);
    const guestOrder = guest.messages.filter(({ type }) => type === 'room' || type === 'snapshot').map(({ type }) => type);
    expect(hostOrder).toEqual(['room', 'snapshot']);
    expect(guestOrder).toEqual(['room', 'snapshot']);
    let hostShell = { screen: 'lobby', fleetState: classicComplete };
    let nonHostShell = { screen: 'lobby', fleetState: classicComplete };
    for (const shell of [hostShell, nonHostShell]) {
      expect(roomPlayMessage.room.game).toBe('fleet-variant');
      shell.screen = 'fleet';
      expect(renderFleet(shell.fleetState, 'p1').text).toContain('1P 승리');
      expect(isFleetState(variantSnapshot.state)).toBe(true);
      shell.fleetState = variantSnapshot.state;
      expect(renderFleet(shell.fleetState, 'p1').labels).toContain('함대 격침 변형 설정');
    }
    const snapshotFirst = renderFleet(variantSnapshot.state, 'p1');
    expect(snapshotFirst.labels).toContain('함대 격침 변형 설정');

    console.log('B28', JSON.stringify({
      initial: { mode: classicComplete.mode, phase: classicComplete.phase, winnerId: classicComplete.winnerId },
      local: { afterStartMode: variantSetup.mode, afterStartPhase: variantSetup.phase, render: '함대 격침 변형 설정/프리셋' },
      roomFirstHost: { afterRoomMode: classicComplete.mode, render: '1P 승리', afterSnapshotMode: hostShell.fleetState.mode },
      roomFirstNonHost: { afterRoomMode: classicComplete.mode, render: '1P 승리', afterSnapshotMode: nonHostShell.fleetState.mode },
      relayOrder: { host: hostOrder, nonHost: guestOrder },
      snapshotFirst: { mode: variantSnapshot.state.mode, render: '함대 격침 변형 설정/프리셋' },
    }));
  });

  it('B-41 proves the real room/catalog contract blocks three-person classic before the artificial renderer defect', () => {
    const classicCatalog = GAME_CATALOG.find(({ id }) => id === 'fleet')!;
    const classicTwo = room('fleet', 2);
    const classicThree = room('fleet', 3);
    const twoLobby = renderLobby(classicTwo);
    const threeLobby = renderLobby(classicThree);
    expect(classicCatalog).toMatchObject({ minPlayers: 2, maxPlayers: 2, people: '2인' });
    expect(canStartRoom(classicTwo)).toBe(true);
    expect(lobbyAction(classicTwo, 'p1').disabled).toBe(false);
    expect(twoLobby.startDisabled).toBe(false);
    expect(canStartRoom(classicThree)).toBe(false);
    expect(lobbyAction(classicThree, 'p1').disabled).toBe(true);
    expect(threeLobby.startDisabled).toBe(true);

    const artificialClassicThree = placeClassic(createFleetState(people(3)));
    const artificialRender = renderFleet(artificialClassicThree, 'p1');
    expect(artificialClassicThree).toMatchObject({ mode: 'classic', phase: 'targeting' });
    expect(artificialRender.labels).not.toContain('이전 플레이어 보드');
    expect(artificialRender.labels).not.toContain('다음 플레이어 보드');
    expect(artificialRender.text).toContain('2P');

    const variantThree = placeVariant(createVariantFleetState(people(3), () => 0.25));
    const variantRender = renderFleet(variantThree, 'p1');
    expect(variantRender.labels).toContain('이전 플레이어 보드');
    expect(variantRender.labels).toContain('다음 플레이어 보드');

    console.log('B41', JSON.stringify({
      catalog: { minPlayers: classicCatalog.minPlayers, maxPlayers: classicCatalog.maxPlayers, people: classicCatalog.people },
      classicTwo: { canStart: canStartRoom(classicTwo), startDisabled: twoLobby.startDisabled },
      classicThree: { canStart: canStartRoom(classicThree), startDisabled: threeLobby.startDisabled },
      artificialClassicThree: { phase: artificialClassicThree.phase, target: '2P', previousButton: false, nextButton: false },
      variantThreeCounter: { phase: variantThree.phase, previousButton: true, nextButton: true },
    }));
  });
});
