import { describe, expect, it } from 'vitest';
import { CLASSIC_FLEET_LENGTHS, FLEET_BOARD_SIZE, createFleetState, projectFleetState, reduceFleet, type FleetShot, type FleetState } from './fleet';

const people = (count = 2) => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `${index + 1}P` }));

function placeClassic(state: FleetState): FleetState {
  let next = state;
  for (const participant of state.participants) {
    CLASSIC_FLEET_LENGTHS.forEach((_, shipIndex) => { next = reduceFleet(next, participant.id, { type: 'place-ship', shipIndex, origin: { row: shipIndex, column: 0 }, orientation: 'horizontal' }); });
    next = reduceFleet(next, participant.id, { type: 'complete-placement' });
  }
  return next;
}

describe('M3-FLEET-1 six-clause acceptance', () => {
  it('1/6 uses a 9x9 board and accepts only the rotatable, non-overlapping 2,3,3,4,5 fleet', () => {
    let state = createFleetState(people());
    expect(state.boardSize).toBe(FLEET_BOARD_SIZE); expect(CLASSIC_FLEET_LENGTHS).toEqual([2, 3, 3, 4, 5]);
    state = reduceFleet(state, 'p1', { type: 'place-ship', shipIndex: 0, origin: { row: 0, column: 0 }, orientation: 'horizontal' });
    const rotated = reduceFleet(state, 'p1', { type: 'rotate-ship', shipIndex: 0 });
    expect(rotated.participants[0]!.ships[0]).toMatchObject({ length: 2, orientation: 'vertical', cells: [{ row: 0, column: 0 }, { row: 1, column: 0 }] });
    expect(reduceFleet(rotated, 'p1', { type: 'place-ship', shipIndex: 1, origin: { row: 0, column: 0 }, orientation: 'horizontal' })).toBe(rotated);
    const ready = placeClassic(createFleetState(people()));
    expect(ready.participants.every(({ ships }) => ships.map(({ length }) => length).join(',') === '2,3,3,4,5')).toBe(true);
    expect(reduceFleet(createFleetState(people()), 'p1', { type: 'place-ship', shipIndex: 4, origin: { row: 8, column: 8 }, orientation: 'horizontal' }).participants[0]!.ships).toEqual([]);
  });

  it('2/6 records one classic shot per turn with hit, miss, sunk, and participant elimination', () => {
    let state = placeClassic(createFleetState(people()));
    state = reduceFleet(state, 'p1', { type: 'shoot', targetParticipantId: 'p2', cell: { row: 8, column: 8 }, shotType: 'classic' });
    expect(state.shots.at(-1)?.result).toBe('miss'); expect(state.turnParticipantId).toBe('p2');
    expect(reduceFleet(state, 'p1', { type: 'shoot', targetParticipantId: 'p2', cell: { row: 0, column: 0 }, shotType: 'classic' })).toBe(state);
    state = reduceFleet(state, 'p2', { type: 'shoot', targetParticipantId: 'p1', cell: { row: 8, column: 8 }, shotType: 'classic' });
    const targetCells = state.participants[1]!.ships.flatMap(({ cells }) => cells);
    for (let index = 0; index < targetCells.length; index += 1) {
      state = reduceFleet(state, 'p1', { type: 'shoot', targetParticipantId: 'p2', cell: targetCells[index]!, shotType: 'classic' });
      if (state.phase !== 'complete') state = reduceFleet(state, 'p2', { type: 'shoot', targetParticipantId: 'p1', cell: { row: 5 + Math.floor(index / 9), column: index % 9 }, shotType: 'classic' });
    }
    expect(new Set(state.shots.map(({ result }) => result))).toEqual(new Set(['miss', 'hit', 'sunk']));
    expect(state.participants.find(({ id }) => id === 'p2')?.alive).toBe(false);
  });

  it('3/6 stores participants and complete shot identities, and declares victory only at exactly one survivor', () => {
    const placed = placeClassic(createFleetState(people(3)));
    const almost = (targetId: string): FleetShot[] => placed.participants.find(({ id }) => id === targetId)!.ships.flatMap(({ cells }) => cells).slice(0, -1).map((cell) => ({ shooter: 'p1', target: targetId, cell, shotType: 'classic', result: 'hit' }));
    const p2 = placed.participants[1]!, p3 = placed.participants[2]!;
    let state: FleetState = { ...placed, participants: [placed.participants[0]!, p2, p3], shots: [...almost('p2'), ...almost('p3')], turnParticipantId: 'p1' };
    const lastP2 = p2.ships.at(-1)!.cells.at(-1)!;
    state = reduceFleet(state, 'p1', { type: 'shoot', targetParticipantId: 'p2', cell: lastP2, shotType: 'classic' });
    expect(state.winnerId).toBeNull(); expect(state.participants.filter(({ alive }) => alive)).toHaveLength(2);
    state = reduceFleet(state, 'p3', { type: 'shoot', targetParticipantId: 'p1', cell: { row: 8, column: 8 }, shotType: 'classic' });
    state = reduceFleet(state, 'p1', { type: 'shoot', targetParticipantId: 'p3', cell: p3.ships.at(-1)!.cells.at(-1)!, shotType: 'classic' });
    expect(state.participants).toHaveLength(3); expect(state.participants.filter(({ alive }) => alive)).toHaveLength(1); expect(state.winnerId).toBe('p1');
    expect(state.shots.every((shot) => ['shooter', 'target', 'cell', 'shotType'].every((field) => field in shot))).toBe(true);
  });

  it('4/6 hides every other placement from seats and hides every placement from spectators', () => {
    const state = placeClassic(createFleetState(people(3)));
    const seated = projectFleetState(state, 'p2'), spectator = projectFleetState(state);
    expect(seated.participants.find(({ id }) => id === 'p2')?.ships).toHaveLength(5);
    expect(seated.participants.filter(({ id }) => id !== 'p2').every((participant) => !('ships' in participant))).toBe(true);
    expect(spectator.participants.every((participant) => !('ships' in participant))).toBe(true);
  });
});
