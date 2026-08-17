import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { App, filterGames } from './App';
import {
  canConfirmFleetTarget,
  CLASSIC_FLEET_NAMES,
  FLEET_SHIP_TEXTURE_ROLES,
  FleetGame,
  fleetShipTexture,
  fleetShotMark,
} from './components/FleetGame';
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

describe('M3-FLEET-2 UI correction population 6', () => {
  const component = readFileSync(new URL('./components/FleetGame.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

  it('1/6 keeps targeting as preview then one explicit existing shoot action, with replaceable and stale-safe selection', () => {
    const state = {
      ...createFleetState([{ id: 'p1', name: '1P' }, { id: 'p2', name: '2P' }]),
      phase: 'targeting', placementParticipantId: null, turnParticipantId: 'p1',
    };
    const first = { targetParticipantId: 'p2', cell: { row: 1, column: 2 }, turnParticipantId: 'p1', shotCount: 0 };
    const changed = { ...first, cell: { row: 3, column: 4 } };
    expect(canConfirmFleetTarget(state, 'p1', first)).toBe(true);
    expect(canConfirmFleetTarget(state, 'p1', changed)).toBe(true);
    expect(canConfirmFleetTarget({ ...state, turnParticipantId: 'p2' }, 'p1', changed)).toBe(false);
    expect(component).toMatch(/onCell=\{\(cell\) => target[^}]*setTargetPreview/);
    expect(component).toContain('class="primary fleet-confirm-shot"');
    expect(component.match(/type: 'shoot'/g)).toHaveLength(1);
    expect(component).not.toMatch(/onCell=\{\(cell\)[^\n]*onAction\(\{ type: 'shoot'/);
  });

  it('2/6 protects both owner labels above dark or occupied board layers with explicit contrast', () => {
    expect(component.match(/class="fleet-board-name"/g)).toHaveLength(2);
    expect(component).toContain('<span class="fleet-board-name">{target');
    expect(component).toContain('<span class="fleet-board-name">{own');
    expect(css).toMatch(/\.fleet-board-shell[^}]*isolation:\s*isolate/);
    expect(css).toMatch(/\.fleet-board-name[^}]*z-index:\s*4[^}]*color:\s*var\(--ink\)[^}]*background:\s*var\(--paper\)/);
  });

  it('3/6 preserves portrait partitions and four blank sides while bounding landscape height without page scroll', () => {
    expect(css).toMatch(/\.fleet-screen[^}]*grid-template-rows:\s*45%\s+10%\s+45%[^}]*aspect-ratio:\s*9\s*\/\s*16/);
    expect(css).toMatch(/\.fleet-zone[^}]*grid-template-columns:\s*15%\s+70%\s+15%/);
    expect(component.match(/<div class="fleet-side" aria-hidden="true" \/>/g)).toHaveLength(2);
    expect(component.match(/<div aria-hidden="true" \/>/g)).toHaveLength(2);
    expect(css).toMatch(/@media \(orientation:\s*landscape\)[^]*\.app-shell:has\(> \.fleet-screen\)[^}]*height:\s*100svh[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/@media \(orientation:\s*landscape\)[^]*\.fleet-screen[^}]*max-height:\s*calc\(100svh - 58px[^}]*overflow:\s*hidden/);
  });

  it('4/6 renders hit as red X, miss as black X, and UI-only partial as a smaller red X', () => {
    expect(fleetShotMark('hit')).toEqual({ kind: 'hit', symbol: '×', label: '명중' });
    expect(fleetShotMark('miss')).toEqual({ kind: 'miss', symbol: '×', label: '빗나감' });
    expect(fleetShotMark('partial')).toEqual({ kind: 'partial', symbol: '×', label: '부분 파괴' });
    expect(css).toMatch(/\.fleet-shot-mark\.hit[^}]*color:\s*var\(--fleet-hit\)/);
    expect(css).toMatch(/\.fleet-shot-mark\.miss[^}]*color:\s*var\(--fleet-miss\)/);
    expect(css).toMatch(/\.fleet-shot-mark\.partial[^}]*color:\s*var\(--fleet-hit\)[^}]*font-size:/);
  });

  it('5/6 uses exactly five reusable roles, rotates vertical geometry, and limits a 4x2 supply shape to corner/body roles', () => {
    expect(FLEET_SHIP_TEXTURE_ROLES).toEqual(['body', 'bow', 'stern', 'corner', 'wide-body']);
    const horizontal = { index: 0, length: 3, orientation: 'horizontal', cells: [{ row: 0, column: 0 }, { row: 0, column: 1 }, { row: 0, column: 2 }] };
    const vertical = { ...horizontal, orientation: 'vertical', cells: [{ row: 0, column: 0 }, { row: 1, column: 0 }, { row: 2, column: 0 }] };
    expect(horizontal.cells.map((_, index) => fleetShipTexture(horizontal, index))).toEqual([
      { role: 'stern', rotation: 0 }, { role: 'body', rotation: 0 }, { role: 'bow', rotation: 0 },
    ]);
    expect(vertical.cells.map((_, index) => fleetShipTexture(vertical, index))).toEqual([
      { role: 'stern', rotation: 90 }, { role: 'body', rotation: 90 }, { role: 'bow', rotation: 90 },
    ]);
    const supply = { index: 5, length: 8, orientation: 'horizontal', cells: Array.from({ length: 8 }, (_, index) => ({ row: Math.floor(index / 4), column: index % 4 })) };
    expect(new Set(supply.cells.map((_, index) => fleetShipTexture(supply, index).role))).toEqual(new Set(['corner', 'wide-body']));
    expect(new Set(supply.cells.map((_, index) => fleetShipTexture(supply, index).rotation))).toEqual(new Set([0, 90, 180, 270]));
  });

  it('6/6 keeps ships pale gray, yellow limited to selection, and all five classic names and lengths identifiable', () => {
    expect(CLASSIC_FLEET_NAMES).toEqual(['2칸 함선', '3칸 함선 A', '3칸 함선 B', '4칸 함선', '5칸 함선']);
    expect(component).toContain('aria-label={`${CLASSIC_FLEET_NAMES[index]}, ${length}칸, ${own?.ships?.some');
    expect(css).toMatch(/--fleet-ship-fill:\s*#f7f7f3/i);
    expect(css).toMatch(/\.fleet-cell\.occupied[^}]*background:\s*var\(--fleet-ship-fill\)/);
    expect(css).not.toMatch(/\.fleet-cell\.occupied[^}]*var\(--accent\)/);
    expect(css).toMatch(/\.fleet-cell\.target-selected[^}]*background:\s*var\(--accent\)/);
    expect(css).toMatch(/\.fleet-ship-picker button\.selected[^}]*background:\s*var\(--accent\)/);
  });
});

describe('M3-FLEET-2 exact texture geometry correction population 3', () => {
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  const ruleBody = (selector) => css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

  it('1/3 places the wide-body single horizontal rule at y=90%', () => {
    const wideBody = ruleBody('\\.fleet-ship-texture\\.texture-wide-body::before');
    expect(wideBody).toMatch(/inset:\s*0\s+0\s+10%/);
    expect(wideBody.match(/border-(?:top|bottom)/g)).toEqual(['border-bottom']);
    expect(wideBody).not.toMatch(/inset:\s*0\s*;/);
  });

  it('2/3 bounds the centered radius-40% right bow half-circle at x=50%-90% and y=10%-90%', () => {
    const connector = ruleBody('\\.fleet-ship-texture\\.texture-bow::before,\\s*\\.fleet-ship-texture\\.texture-stern::before');
    const bow = ruleBody('\\.fleet-ship-texture\\.texture-bow::after');
    expect(connector).toMatch(/top:\s*10%;\s*right:\s*50%;\s*bottom:\s*10%;\s*left:\s*0/);
    expect(bow).toMatch(/top:\s*10%;\s*right:\s*10%;\s*bottom:\s*10%;\s*left:\s*50%/);
    expect(bow).toMatch(/border-radius:\s*0\s+100%\s+100%\s+0\s*\/\s*0\s+50%\s+50%\s+0/);
    expect(bow).not.toMatch(/width:\s*80%/);
  });

  it('3/3 joins the centered height-80% stern half-square to the same x=50% connectors', () => {
    const connector = ruleBody('\\.fleet-ship-texture\\.texture-bow::before,\\s*\\.fleet-ship-texture\\.texture-stern::before');
    const stern = ruleBody('\\.fleet-ship-texture\\.texture-stern::after');
    expect(connector).toMatch(/right:\s*50%/);
    expect(stern).toMatch(/top:\s*10%;\s*right:\s*10%;\s*bottom:\s*10%;\s*left:\s*50%/);
    expect(stern).not.toMatch(/right:\s*10%;\s*width:\s*40%/);
  });
});
