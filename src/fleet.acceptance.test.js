import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { App, filterGames } from './App';
import { FleetGame } from './components/FleetGame';
import { GAME_CATALOG } from './game/catalog';
import { createFleetState } from './game/fleet';
import { RoomLobby } from './lobby/RoomLobby';
import { canStartRoom } from './lobby/room-state';
import { LoopbackTransport } from './transport/transport';

const tree = (node) => node == null || typeof node === 'boolean' ? [] : Array.isArray(node) ? node.flatMap(tree) : typeof node !== 'object' ? [] : [node, ...tree(node.props?.children)];

describe('M3-FLEET-1 screen and integration acceptance', () => {
  it('5/6 encodes the portrait 45/10/45 and 15/70/15 skeleton, 88%-high square boards, phase-only input, own lower board, and blank side zones', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8'), source = FleetGame.toString();
    expect(css).toMatch(/\.fleet-screen[^}]*grid-template-rows:\s*45%\s+10%\s+45%/);
    expect(css).toMatch(/\.fleet-screen[^}]*aspect-ratio:\s*9\s*\/\s*16/);
    expect(css).toMatch(/\.fleet-zone[^}]*grid-template-columns:\s*15%\s+70%\s+15%/);
    expect(css).toMatch(/\.fleet-board-shell[^}]*width:\s*100%[^}]*height:\s*88%[^}]*aspect-ratio:\s*1/);
    expect(source).toMatch(/participant:\s*own/); expect(source).toMatch(/interactive:\s*canPlace/);
    expect(source).toMatch(/participant:\s*target/); expect(source).toMatch(/interactive:\s*canShoot/);
    expect(source.match(/aria-hidden/g)).toHaveLength(4);
  });

  it('correction 1/2 exposes classic Fleet as exactly two-player while retaining the shared state and opaque transport paths', async () => {
    expect(GAME_CATALOG.find(({ id }) => id === 'fleet')).toMatchObject({ name: '함대 격침', people: '2인', minPlayers: 2, maxPlayers: 2 });
    expect(filterGames('함대 격침', '2', []).map(({ id }) => id)).toContain('fleet');
    expect(filterGames('함대 격침', '3-4', []).map(({ id }) => id)).not.toContain('fleet');
    const app = App.toString(), appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8'), relay = readFileSync(new URL('../relay/worker.js', import.meta.url), 'utf8');
    expect(app).toContain('startLocalFleet'); expect(app).toMatch(/game:\s*["']fleet["']/); expect(relay).not.toMatch(/fleet/i);
    expect(appSource).not.toMatch(/fleetPlayers|setFleetPlayers|game\.id === 'fleet' && <label>참가자 수/);
    expect(appSource).toMatch(/publishFleetStart\(\[\{ id: 'local-1',[\s\S]*\{ id: 'local-2',[\s\S]*\}\], false\)/);
    expect(appSource).toContain("game === 'fleet') publishFleetStart(participants.slice(0, 2), true)");
    const room = { code: 'ABC-67', hostId: 'p1', game: 'fleet', teamNames: ['왼쪽', '오른쪽'], settings: { aiOpponent: false }, phase: 'lobby', participants: [{ id: 'p1', slot: 1, name: '1P', ready: true, present: true }, { id: 'p2', slot: 2, name: '2P', ready: true, present: true }] };
    expect(canStartRoom({ ...room, participants: room.participants.slice(0, 1) })).toBe(false); expect(canStartRoom(room)).toBe(true);
    expect(canStartRoom({ ...room, participants: [...room.participants, { id: 'p3', slot: 3, name: '3P', ready: true, present: true }] })).toBe(false);
    expect(canStartRoom({ ...room, settings: { aiOpponent: true } })).toBe(false);
    const lobby = tree(RoomLobby({ room, selfId: 'p1', send() {}, openGames() {} }));
    expect(lobby.find((node) => node.props?.class === 'team-headings')).toBeUndefined(); expect(lobby.find((node) => node.props?.class === 'game-settings')).toBeUndefined();
    const transport = new LoopbackTransport(), state = createFleetState([{ id: 'p1', name: '1P' }, { id: 'p2', name: '2P' }]);
    const received = new Promise((resolve) => transport.onMessage(resolve)); await transport.connect(); transport.send({ type: 'snapshot', game: 'fleet', state });
    await expect(received).resolves.toEqual({ type: 'snapshot', game: 'fleet', state });
  });

  it('correction 2/2 keeps both classic upper side zones blank and visibly gives the shot characteristic and explanation around the own board', () => {
    const source = readFileSync(new URL('./components/FleetGame.tsx', import.meta.url), 'utf8');
    expect(source.match(/<div class="fleet-side" aria-hidden="true" \/>/g)).toHaveLength(2);
    expect(source).toContain('일반탄 · 턴당 한 발');
    expect(source).toMatch(/fleet-lower-center[^]*fleet-shot-description[^]*일반탄 — 선택한 한 칸을 공격합니다\.[^]*fleet-board-shell/);
  });
});
