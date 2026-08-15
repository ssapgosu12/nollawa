import { describe, expect, it } from 'vitest';
import {
  CLASSIC_FLEET_LENGTHS, FLEET_BOARD_SIZE, VARIANT_FLEET_LENGTHS, createFleetState, createVariantFleetState,
  isFleetAction, isFleetState, projectFleetState, reduceFleet, type FleetShot, type FleetState,
} from './fleet';

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

describe('M3-FLEET-3 foundation acceptance', () => {
  it('1/2 keeps classic exact while variant boards and the six-ship 21-cell base fleet follow player count', () => {
    const classic = createFleetState(people());
    expect({ mode: classic.mode, boardSize: classic.boardSize, lengths: classic.baseFleetLengths, phase: classic.phase }).toEqual({
      mode: 'classic', boardSize: 9, lengths: [2, 3, 3, 4, 5], phase: 'placement',
    });
    expect(FLEET_BOARD_SIZE).toBe(9); expect(CLASSIC_FLEET_LENGTHS).toEqual([2, 3, 3, 4, 5]);

    for (const count of [2, 3, 4, 5, 6]) {
      const variant = createVariantFleetState(people(count), () => 0.25);
      expect(variant.boardSize).toBe(count === 2 ? 10 : 12);
      expect(variant.baseFleetLengths).toEqual(VARIANT_FLEET_LENGTHS);
      expect(variant.baseFleetLengths).toHaveLength(6);
      expect(variant.baseFleetLengths.reduce((total, length) => total + length, 0)).toBe(21);
    }
  });

  it('2/2 offers three presets, chooses one shooting card, and enforces 4 choose 2 or 3 choose 1 special ships', () => {
    for (const count of [2, 3, 6]) {
      let state = createVariantFleetState(people(count), () => 0.375);
      const offerCount = count === 2 ? 3 : 4;
      const choiceCount = count === 2 ? 1 : 2;
      for (const participant of state.participants) {
        expect(participant.variantSetup?.presetOffers).toHaveLength(3);
        expect(new Set(participant.variantSetup?.presetOffers.map(({ shootingCard }) => shootingCard)).size).toBe(3);
        expect(participant.variantSetup?.presetOffers.every(({ specialShipOffers }) => specialShipOffers.length === offerCount)).toBe(true);

        const preset = participant.variantSetup!.presetOffers[0]!;
        state = reduceFleet(state, participant.id, { type: 'choose-variant-preset', presetId: preset.id });
        expect(state.participants.find(({ id }) => id === participant.id)?.variantSetup?.shootingCard).toBe(preset.shootingCard);
        const unchanged = reduceFleet(state, participant.id, {
          type: 'choose-special-ships', specialShips: preset.specialShipOffers.slice(0, choiceCount + 1),
        });
        expect(unchanged).toBe(state);
        state = reduceFleet(state, participant.id, {
          type: 'choose-special-ships', specialShips: preset.specialShipOffers.slice(0, choiceCount),
        });
        expect(isFleetAction(JSON.parse(JSON.stringify({
          type: 'choose-special-ships', specialShips: preset.specialShipOffers.slice(0, choiceCount),
        })))).toBe(true);
      }
      expect(state.phase).toBe('placement');
      expect(state.setupParticipantId).toBeNull();
      expect(state.placementParticipantId).toBe('p1');
      expect(state.participants.every(({ variantSetup }) => variantSetup?.complete)).toBe(true);
      expect(isFleetState(JSON.parse(JSON.stringify(state)))).toBe(true);
    }
  });
});
