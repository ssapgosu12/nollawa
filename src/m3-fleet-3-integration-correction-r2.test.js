import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createVariantFleetState, projectFleetState, reduceFleet } from './game/fleet';

const people = (count) => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `${index + 1}P` }));
const blueprint = (id, special = null, columns = 1) => ({ id, special, shape: { rows: 1, columns }, placementTag: null });
const ship = (item, index, row, sunk = false) => ({ index, length: item.shape.columns, orientation: 'horizontal', special: item.special, blueprintId: item.id, placementTag: null, cells: Array.from({ length: item.shape.columns }, (_, column) => ({ row, column })), damage: Array.from({ length: item.shape.columns }, () => sunk ? 1 : 0), sunk });
const ready = (cards, fleets) => {
  const state = createVariantFleetState(people(cards.length), () => .25);
  return { ...state, phase: 'targeting', setupParticipantId: null, placementParticipantId: null, turnParticipantId: 'p1', participants: state.participants.map((participant, index) => ({ ...participant, placementComplete: true, variantSetup: { ...participant.variantSetup, shootingCard: cards[index], complete: true, fleet: fleets[index] }, ships: fleets[index].map((item, shipIndex) => ship(item, shipIndex, index * 3 + shipIndex)) })) };
};

describe('M3-FLEET-3-INTEGRATION-CORRECTION-R2 direct population 3', () => {
  it('1/3 projects and visibly renders a spy scout only for its owner without public effects', () => {
    const spy = blueprint('spy', 'spy', 2), base = blueprint('base');
    const state = ready(['flare', 'flare'], [[spy, base], [base]]);
    const scouted = reduceFleet(state, 'p1', { type: 'scout-variant-cell', targetParticipantId: 'p2', cell: { row: 3, column: 0 } });
    expect(projectFleetState(scouted, 'p1').privateScouts).toMatchObject([{ ownerId: 'p1', targetId: 'p2', cell: { row: 3, column: 0 }, occupied: true }]);
    expect(projectFleetState(scouted, 'p2').privateScouts).toEqual([]);
    expect(projectFleetState(scouted).privateScouts).toEqual([]);
    expect(scouted.shots).toEqual([]); expect(scouted.presentationQueue).toEqual([]);
    const component = readFileSync(new URL('./components/FleetGame.tsx', import.meta.url), 'utf8');
    expect(component).toContain('view.privateScouts?.map'); expect(component).toContain("scout.occupied ? 'OCCUPIED' : 'EMPTY'");
  });

  it('2/3 preserves three flare impact targets through UI selection and authority serialization while rejecting forged identity', () => {
    const base = blueprint('base'), state = ready(['flare', 'flare', 'flare', 'flare'], [[base], [base], [base], [base]]);
    const action = JSON.parse(JSON.stringify({ type: 'queue-variant-shot', targetParticipantId: 'p2', targetParticipantIds: ['p2', 'p3', 'p4'], plan: { type: 'flare', normalCell: { row: 1, column: 1 }, flareCells: [{ row: 2, column: 2 }, { row: 3, column: 3 }] } }));
    const accepted = reduceFleet(state, 'p1', action);
    expect(accepted.roundPlans[0].impacts.map(({ targetParticipantId, kind }) => [targetParticipantId, kind])).toEqual([['p2', 'normal'], ['p3', 'flare'], ['p4', 'flare']]);
    for (const targetParticipantIds of [['p2', 'p3'], ['p1', 'p3', 'p4'], ['p2', 'missing', 'p4']]) expect(reduceFleet(state, 'p1', { ...action, targetParticipantIds })).toBe(state);
    expect(reduceFleet(state, 'p1', { ...action, targetParticipantId: 'p3' })).toBe(state);
    const dead = { ...state, participants: state.participants.map((participant) => participant.id === 'p3' ? { ...participant, alive: false, ships: participant.ships.map((item) => ({ ...item, sunk: true })) } : participant) };
    expect(reduceFleet(dead, 'p1', action)).toBe(dead);
    const component = readFileSync(new URL('./components/FleetGame.tsx', import.meta.url), 'utf8');
    expect(component).toContain('{ targetParticipantId: target.id, cell }'); expect(component).toContain('targetParticipantIds: flareTargets');
  });

  it('3/3 reveals exactly a final unsunk submarine to active opponents and keeps spectator projection unchanged', () => {
    const base = blueprint('base'), submarine = blueprint('sub', 'submarine', 2);
    let state = ready(['flare', 'flare', 'flare'], [[base], [submarine, base], [base]]);
    expect(projectFleetState(state, 'p1').participants.find(({ id }) => id === 'p2').ships).toBeUndefined();
    state = { ...state, participants: state.participants.map((participant) => participant.id === 'p2' ? { ...participant, ships: participant.ships.map((item) => item.special === 'submarine' ? item : { ...item, damage: [1], sunk: true }) } : participant) };
    const opponentShips = projectFleetState(state, 'p1').participants.find(({ id }) => id === 'p2').ships;
    expect(opponentShips).toHaveLength(1); expect(opponentShips[0]).toMatchObject({ special: 'submarine', cells: [{ row: 3, column: 0 }, { row: 3, column: 1 }] });
    expect(projectFleetState(state, 'p2').participants.find(({ id }) => id === 'p2').ships).toHaveLength(2);
    const eliminatedViewer = { ...state, participants: state.participants.map((participant) => participant.id === 'p3' ? { ...participant, alive: false, ships: participant.ships.map((item) => ({ ...item, sunk: true })) } : participant) };
    expect(projectFleetState(eliminatedViewer, 'p3').participants.every(({ ships }) => ships?.length)).toBe(true);
    expect(projectFleetState(eliminatedViewer, 'p3').participants.find(({ id }) => id === 'p2').ships).toHaveLength(2);
  });
});
