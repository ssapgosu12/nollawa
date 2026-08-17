import { describe, expect, it } from 'vitest';
import { createVariantFleetState, reduceFleet } from './game/fleet';
import { buildVariantFleet, canShipReceivePlacementTag } from './game/fleet-special';

const people = (count = 2) => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `${index + 1}P` }));

const readyToTarget = (shootingCard) => {
  const state = createVariantFleetState(people(), () => 0.5);
  return {
    ...state,
    phase: 'targeting',
    setupParticipantId: null,
    placementParticipantId: null,
    turnParticipantId: 'p1',
    participants: state.participants.map((participant, index) => ({
      ...participant,
      placementComplete: true,
      variantSetup: { ...participant.variantSetup, shootingCard: index === 0 ? shootingCard : 'flare', complete: true },
    })),
  };
};

const queue = (state, plan) => reduceFleet(state, 'p1', {
  type: 'queue-variant-shot', targetParticipantId: 'p2', plan,
});

const impacts = (state) => state.roundPlans?.find(({ participantId }) => participantId === 'p1')?.impacts ?? [];

describe('M3-FLEET-EDGE B-2 tracer reducer behavior', () => {
  it.each([
    ['first row', { row: 0, column: 4 }],
    ['last row', { row: 9, column: 4 }],
    ['first column', { row: 4, column: 0 }],
    ['last column', { row: 4, column: 9 }],
  ])('retains in-board impacts for a tracer center on the %s', (_name, center) => {
    const initial = readyToTarget('tracer');
    const accepted = queue(initial, { type: 'tracer', center });
    expect(accepted).not.toBe(initial);
    expect(impacts(accepted)).toHaveLength(4);
    expect(impacts(accepted).some(({ cell, kind }) => cell.row === center.row && cell.column === center.column && kind === 'normal')).toBe(true);
    expect(impacts(accepted).every(({ cell }) => cell.row >= 0 && cell.row < 10 && cell.column >= 0 && cell.column < 10)).toBe(true);
  });

  it('rejects a tracer center outside the board without consuming the use', () => {
    const initial = readyToTarget('tracer');
    expect(queue(initial, { type: 'tracer', center: { row: -1, column: 4 } })).toBe(initial);
  });

  it('rejects a range center more than two cells beyond the board', () => {
    const initial = readyToTarget('high-explosive');
    expect(queue(initial, { type: 'explosive', boardSize: 10, turnIndex: 0, center: { row: -3, column: 4 } })).toBe(initial);
  });
});

const specialKind = {
  'extra-armor': 'armor', submarine: 'submarine', 'aircraft-carrier': 'carrier', 'glass-cannon': 'glass-cannon',
  'spy-ship': 'spy', 'supply-ship': 'supply', 'paper-ship': 'paper',
};

const tagRandom = (coastalSample, oceanSample) => {
  let calls = 0;
  return () => {
    calls += 1;
    if (calls === 14) return coastalSample;
    if (calls === 15) return oceanSample;
    return 0.5;
  };
};

const chooseTags = (selected, coastalSample, oceanSample) => {
  let state = createVariantFleetState(people(3), tagRandom(coastalSample, oceanSample));
  const participant = state.participants[0];
  const preset = { ...participant.variantSetup.presetOffers[0], specialShipOffers: selected };
  state = {
    ...state,
    participants: state.participants.map((item, index) => index === 0 ? {
      ...item, variantSetup: { ...item.variantSetup, presetOffers: [preset, ...item.variantSetup.presetOffers.slice(1)] },
    } : item),
  };
  state = reduceFleet(state, 'p1', { type: 'choose-variant-preset', presetId: preset.id });
  state = reduceFleet(state, 'p1', { type: 'choose-special-ships', specialShips: selected });
  return state.participants[0].variantSetup.fleet;
};

describe('M3-FLEET-EDGE B-8 unbiased tag recipients', () => {
  it.each([
    ['8 ships', ['extra-armor', 'submarine']],
    ['9 ships', ['extra-armor', 'spy-ship']],
    ['10 ships', ['spy-ship', 'paper-ship']],
  ])('lets every eligible ship in %s receive coastal and ocean across caller-controlled samples', (_name, selected) => {
    const expected = buildVariantFleet(selected.map((kind) => specialKind[kind]));
    const coastalReached = new Set();
    const oceanReached = new Set();

    for (let coastalIndex = 0; coastalIndex < expected.length; coastalIndex += 1) {
      const fleet = chooseTags(selected, (coastalIndex + 0.5) / expected.length, 0);
      const coastal = fleet.find(({ placementTag }) => placementTag === 'coastal');
      const ocean = fleet.find(({ placementTag }) => placementTag === 'ocean');
      expect(coastal).toBeDefined();
      expect(ocean).toBeDefined();
      expect(ocean.id).not.toBe(coastal.id);
      expect(fleet.filter(({ placementTag }) => placementTag !== null)).toHaveLength(2);
      expect(canShipReceivePlacementTag(coastal, 'coastal', 12)).toBe(true);
      expect(canShipReceivePlacementTag(ocean, 'ocean', 12)).toBe(true);
      expect(fleet.filter(({ id }) => id !== coastal.id && id !== ocean.id).every(({ placementTag }) => placementTag === null)).toBe(true);
      coastalReached.add(coastal.id);
    }

    for (let targetIndex = 0; targetIndex < expected.length; targetIndex += 1) {
      const coastalIndex = (targetIndex + 1) % expected.length;
      const oceanCandidates = expected.filter((_, index) => index !== coastalIndex);
      const oceanIndex = oceanCandidates.findIndex(({ id }) => id === expected[targetIndex].id);
      const fleet = chooseTags(selected, (coastalIndex + 0.5) / expected.length, (oceanIndex + 0.5) / oceanCandidates.length);
      oceanReached.add(fleet.find(({ placementTag }) => placementTag === 'ocean').id);
    }

    expect(coastalReached).toEqual(new Set(expected.map(({ id }) => id)));
    expect(oceanReached).toEqual(new Set(expected.map(({ id }) => id)));
  });
});

describe('M3-FLEET-EDGE B-39 specification conflict reproduction', () => {
  it('keeps the one-in-board one-out-of-board piercing ambiguity unresolved', () => {
    const initial = readyToTarget('piercing');
    const ambiguous = queue(initial, { type: 'piercing', cells: [{ row: 4, column: 9 }, { row: 4, column: 10 }] });
    expect(ambiguous).toBe(initial);
    expect(impacts(ambiguous)).toEqual([]);
  });
});
