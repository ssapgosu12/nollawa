import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_CATALOG } from './game/catalog';
import { CLASSIC_FLEET_LENGTHS, createFleetState, createVariantFleetState, projectFleetState, reduceFleet } from './game/fleet';
import { canStartRoom } from './lobby/room-state';
import { LoopbackTransport } from './transport/transport';

const people = (count) => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `${index + 1}P` }));
const readyVariant = (count) => {
  const state = createVariantFleetState(people(count), () => 0.25);
  const blueprint = { id: 'integration-one', shape: { rows: 1, columns: 1 }, special: null, placementTag: null };
  return {
    ...state, phase: 'targeting', setupParticipantId: null, placementParticipantId: null, turnParticipantId: 'p1',
    participants: state.participants.map((participant, index) => ({
      ...participant, placementComplete: true,
      variantSetup: { ...participant.variantSetup, shootingCard: 'buckshot', complete: true, fleet: [blueprint] },
      ships: [{ index: 0, length: 1, orientation: 'horizontal', cells: [{ row: index, column: index }], blueprintId: blueprint.id, special: null, placementTag: null, damage: [0], sunk: false }],
    })),
  };
};
const queue = (state, actor, target, cell) => reduceFleet(state, actor, { type: 'queue-variant-shot', targetParticipantId: target, plan: { type: 'buckshot', boardSize: state.boardSize, choice: 'normal', cell } });
const submit = (state, actor) => reduceFleet(state, actor, { type: 'submit-variant-plan' });

describe('M3-FLEET-3-INTEGRATION population 3', () => {
  it('7/9 accepts every living submission concurrently, resolves only at the all-living barrier from one pre-resolution state, then queues attacker/caption and result sequentially', () => {
    let state = readyVariant(3);
    state = queue(state, 'p2', 'p3', { row: 2, column: 2 });
    state = submit(state, 'p2');
    expect(state.shots).toHaveLength(0);
    state = queue(state, 'p1', 'p3', { row: 2, column: 2 });
    state = submit(state, 'p1');
    expect(state.shots).toHaveLength(0);
    state = queue(state, 'p3', 'p1', { row: 11, column: 11 });
    state = submit(state, 'p3');
    expect(state.shots).toHaveLength(3);
    expect(state.shots.filter(({ target }) => target === 'p3').map(({ result }) => result)).toEqual(['sunk', 'hit']);
    expect(state.presentationQueue.map(({ kind }) => kind)).toEqual(['caption', 'result', 'caption', 'result', 'caption', 'result']);
    expect(state.presentationQueue[0].text).toBe('1P → 3P 공격!');
    expect(state.presentationQueue[1].text).toBe('HIT!');
  });

  it('8/9 retains eliminated spectator boards, reveals every fleet to eliminated viewers, and distinguishes the last survivor from a zero-survivor draw', () => {
    let winner = readyVariant(3);
    winner = queue(winner, 'p1', 'p2', { row: 1, column: 1 });
    winner = queue(winner, 'p2', 'p3', { row: 2, column: 2 });
    winner = queue(winner, 'p3', 'p2', { row: 1, column: 1 });
    winner = submit(submit(submit(winner, 'p2'), 'p1'), 'p3');
    expect(winner.participants).toHaveLength(3);
    expect(winner.participants.map(({ alive }) => alive)).toEqual([true, false, false]);
    expect(winner).toMatchObject({ phase: 'complete', winnerId: 'p1', draw: false });
    expect(projectFleetState(winner, 'p2').participants.every(({ ships }) => ships?.length === 1)).toBe(true);

    let draw = readyVariant(2);
    draw = queue(draw, 'p1', 'p2', { row: 1, column: 1 });
    draw = queue(draw, 'p2', 'p1', { row: 0, column: 0 });
    draw = submit(submit(draw, 'p1'), 'p2');
    expect(draw).toMatchObject({ phase: 'complete', winnerId: null, draw: true });
    expect(draw.participants.filter(({ alive }) => alive)).toHaveLength(0);
  });

  it('9/9 spans enemies in one plan, resets centrally, and exposes one distinct classic/variant catalog-App-local/remote lobby path with required UI invariants', async () => {
    let state = readyVariant(3);
    state = { ...state, participants: state.participants.map((participant) => participant.id === 'p1' ? { ...participant, variantSetup: { ...participant.variantSetup, shootingCard: 'salvo' } } : participant) };
    state = reduceFleet(state, 'p1', { type: 'queue-variant-shot', targetParticipantId: 'p2', plan: { type: 'salvo', turnInCycle: 0, previousTurnShotCounts: [], cells: [{ row: 1, column: 1 }] } });
    state = reduceFleet(state, 'p1', { type: 'queue-variant-shot', targetParticipantId: 'p3', plan: { type: 'salvo', turnInCycle: 0, previousTurnShotCounts: [], cells: [{ row: 2, column: 2 }] } });
    expect(new Set(state.roundPlans[0].impacts.map(({ targetParticipantId }) => targetParticipantId))).toEqual(new Set(['p2', 'p3']));
    state = reduceFleet(state, 'p1', { type: 'reset-variant-plan' });
    expect(state.roundPlans).toEqual([]);

    const component = readFileSync(new URL('./components/FleetGame.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
    expect(component).toContain('모든 발 회수'); expect(component).toContain('participants.length >= 3');
    expect(component).toContain('fleet-carousel'); expect(component).toContain('class="fleet-board-name"');
    expect(component).toContain('invalid-zone-flash'); expect(component).toContain("placementTag === 'coastal' ? '연안'");
    expect(component).toContain('FLEET_SHIP_TEXTURE_ROLES'); expect(component).not.toMatch(/score|점수판/i);
    expect(component).toContain('presentationQueue?.[presentationIndex]'); expect(component).not.toContain('presentationQueue?.map');
    expect(css).toMatch(/--fleet-ship-fill:\s*#f7f7f3/i); expect(css).toContain('.fleet-cell.invalid-placement-zone');
    expect(css).toMatch(/\.fleet-shot-mark\.hit[^}]*var\(--fleet-hit\)/); expect(css).toMatch(/\.fleet-shot-mark\.miss[^}]*var\(--fleet-miss\)/); expect(css).toMatch(/\.fleet-shot-mark\.partial[^}]*var\(--fleet-hit\)/);
    expect(GAME_CATALOG.filter(({ id }) => id === 'fleet' || id === 'fleet-variant').map(({ id, minPlayers, maxPlayers }) => ({ id, minPlayers, maxPlayers }))).toEqual([
      { id: 'fleet', minPlayers: 2, maxPlayers: 2 }, { id: 'fleet-variant', minPlayers: 2, maxPlayers: 6 },
    ]);
    expect(app).toContain('startLocalVariantFleet'); expect(app).toContain("game === 'fleet-variant'"); expect(app).toContain('publishVariantFleetStart(participants, true)');
    const room = (count) => ({ code: 'ABC-67', hostId: 'p1', game: 'fleet-variant', teamNames: ['A', 'B'], settings: { aiOpponent: false }, phase: 'lobby', participants: people(count).map((person, index) => ({ ...person, slot: index + 1, ready: true, present: true })) });
    expect(canStartRoom(room(2))).toBe(true); expect(canStartRoom(room(6))).toBe(true); expect(canStartRoom({ ...room(3), settings: { aiOpponent: true } })).toBe(false);
    const transport = new LoopbackTransport(), received = new Promise((resolve) => transport.onMessage(resolve));
    await transport.connect(); transport.send({ type: 'snapshot', game: 'fleet-variant', state: readyVariant(3) });
    await expect(received).resolves.toMatchObject({ type: 'snapshot', game: 'fleet-variant', state: { mode: 'variant' } });
    expect(createFleetState(people(2))).toMatchObject({ mode: 'classic', boardSize: 9, baseFleetLengths: [...CLASSIC_FLEET_LENGTHS] });
  });
});
