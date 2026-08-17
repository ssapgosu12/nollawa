import { describe, expect, it } from 'vitest';
import { createVariantFleetState, projectFleetState, reduceFleet } from './game/fleet';

const people = (count = 2) => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `${index + 1}P` }));
const blueprint = (id, special = null, rows = 1, columns = 1) => ({ id, special, shape: { rows, columns }, placementTag: null });
const ship = (item, index, row, sunk = false) => ({
  index, length: item.shape.rows * item.shape.columns, orientation: 'horizontal', special: item.special,
  blueprintId: item.id, placementTag: null, cells: Array.from({ length: item.shape.rows * item.shape.columns }, (_, offset) => ({ row, column: offset })),
  damage: Array.from({ length: item.shape.rows * item.shape.columns }, () => sunk ? 1 : 0), sunk,
});
const ready = (cards, fleets = cards.map((_, index) => [blueprint(`base-${index}`)]), round = 1, shots = []) => {
  const state = createVariantFleetState(people(cards.length), () => .25);
  return {
    ...state, phase: 'targeting', setupParticipantId: null, placementParticipantId: null, turnParticipantId: 'p1', round, shots,
    participants: state.participants.map((participant, index) => ({
      ...participant, placementComplete: true,
      variantSetup: { ...participant.variantSetup, shootingCard: cards[index], complete: true, fleet: fleets[index] },
      ships: fleets[index].map((item, shipIndex) => ship(item, shipIndex, index * 3 + shipIndex)),
    })),
  };
};
const queue = (state, actor, target, plan) => reduceFleet(state, actor, { type: 'queue-variant-shot', targetParticipantId: target, plan });
const flare = (normalCell = { row: 9, column: 9 }, flareCells = [{ row: 8, column: 8 }, { row: 8, column: 9 }]) => ({ type: 'flare', normalCell, flareCells });

describe('M3-FLEET-3 correction reducer authority', () => {
  it('plays all eight cards with exact authority cadence, caller outcomes, range, axes, and no repeat over-fire', () => {
    let state = ready(['salvo', 'flare']);
    state = queue(state, 'p1', 'p2', { type: 'salvo', turnInCycle: 0, previousTurnShotCounts: [], cells: [{ row: 1, column: 1 }, { row: 1, column: 2 }, { row: 1, column: 3 }] });
    expect(state.roundPlans[0].impacts).toHaveLength(3);
    expect(queue(state, 'p1', 'p2', { type: 'salvo', turnInCycle: 0, previousTurnShotCounts: [], cells: [{ row: 2, column: 2 }] })).toBe(state);
    const history = [0, 1, 2].map((column) => ({ shooter: 'p1', target: 'p2', cell: { row: 9, column }, shotType: 'salvo', result: 'miss', round: 1, impactKind: 'normal' }));
    state = ready(['salvo', 'flare'], undefined, 2, history);
    expect(queue(state, 'p1', 'p2', { type: 'salvo', turnInCycle: 1, previousTurnShotCounts: [3], cells: [{ row: 2, column: 2 }] }).roundPlans[0].impacts).toHaveLength(1);
    expect(queue(state, 'p1', 'p2', { type: 'salvo', turnInCycle: 1, previousTurnShotCounts: [2], cells: [{ row: 2, column: 2 }] })).toBe(state);

    state = ready(['flare', 'flare']);
    const independent = flare({ row: 4, column: 4 }, [{ row: 0, column: 0 }, { row: 9, column: 9 }]);
    const flared = queue(state, 'p1', 'p2', independent);
    expect(flared.roundPlans[0].impacts.map(({ cell, kind }) => [cell.row, cell.column, kind])).toEqual([[4, 4, 'normal'], [0, 0, 'flare'], [9, 9, 'flare']]);
    expect(queue(flared, 'p1', 'p2', independent)).toBe(flared);

    for (const [card, plan, count] of [
      ['tracer', { type: 'tracer', center: { row: 4, column: 4 } }, 5],
      ['high-explosive', { type: 'explosive', boardSize: 10, turnIndex: 0, center: { row: -2, column: 4 } }, 0],
      ['scatter', { type: 'scatter', boardSize: 10, turnIndex: 0, center: { row: 11, column: 4 } }, 0],
      ['piercing', { type: 'piercing', cells: [{ row: 4, column: 4 }, { row: 5, column: 4 }] }, 2],
      ['buckshot', { type: 'buckshot', boardSize: 10, choice: 'buckshot', center: { row: 4, column: 4 }, centerCells: [{ row: 3, column: 3 }, { row: 4, column: 4 }, { row: 5, column: 5 }], outerCells: [{ row: 2, column: 2 }, { row: 2, column: 4 }, { row: 6, column: 6 }] }, 6],
    ]) {
      const initial = ready([card, 'flare']), accepted = queue(initial, 'p1', 'p2', plan);
      expect(accepted).not.toBe(initial); expect(accepted.roundPlans[0].impacts).toHaveLength(count); expect(queue(accepted, 'p1', 'p2', plan)).toBe(accepted);
    }
    const horizontal = queue(ready(['piercing', 'flare']), 'p1', 'p2', { type: 'piercing', cells: [{ row: 4, column: 4 }, { row: 4, column: 5 }] });
    expect(horizontal.roundPlans[0].impacts).toHaveLength(2);
    const hit = { shooter: 'p2', target: 'p2', cell: { row: 3, column: 3 }, shotType: 'flare', result: 'hit', round: 1, impactKind: 'normal' };
    state = ready(['random-shot', 'flare'], undefined, 1, [hit]);
    expect(queue(state, 'p1', 'p2', { type: 'random', normalCell: { row: 4, column: 4 }, randomCells: [{ row: 0, column: 0 }, { row: 9, column: 9 }], alreadyHitCells: [hit.cell] }).roundPlans[0].impacts).toHaveLength(3);
    expect(queue(state, 'p1', 'p2', { type: 'random', normalCell: { row: 4, column: 4 }, randomCells: [{ row: 0, column: 0 }], alreadyHitCells: [] })).toBe(state);
  });

  it('wires carrier, glass-cannon pressure/tracer, and spy into live per-owner state with exact extinction', () => {
    const carrier = blueprint('carrier', 'carrier', 1, 5), glass = blueprint('glass', 'glass-cannon'), spy = blueprint('spy', 'spy', 1, 2), base = blueprint('base');
    let state = ready(['flare', 'flare'], [[carrier, base, blueprint('a'), blueprint('b')], [base]]);
    state = queue(state, 'p1', 'p2', flare());
    const withCarrier = queue(state, 'p1', 'p2', { type: 'normal', cell: { row: 7, column: 7 } });
    expect(withCarrier.roundPlans[0].uses.map(({ kind }) => kind)).toEqual(['card', 'carrier']);
    expect(withCarrier.roundPlans[0].impacts.at(-1).shotType).toBe('bonus-normal');
    expect(queue(withCarrier, 'p1', 'p2', { type: 'normal', cell: { row: 6, column: 6 } })).toBe(withCarrier);
    expect(reduceFleet(withCarrier, 'p1', { type: 'queue-variant-shot', targetParticipantId: 'p2', plan: null })).toBe(withCarrier);
    const threeSunk = { ...state, participants: state.participants.map((participant) => participant.id === 'p1' ? { ...participant, ships: participant.ships.map((item, index) => index < 3 ? { ...item, sunk: true, damage: item.damage.map(() => 1) } : item) } : participant) };
    expect(queue(threeSunk, 'p1', 'p2', { type: 'normal', cell: { row: 7, column: 7 } })).toBe(threeSunk);
    const carrierSunk = { ...state, participants: state.participants.map((participant) => participant.id === 'p1' ? { ...participant, ships: participant.ships.map((item) => item.special === 'carrier' ? { ...item, sunk: true, damage: item.damage.map(() => 1) } : item) } : participant) };
    expect(queue(carrierSunk, 'p1', 'p2', { type: 'normal', cell: { row: 7, column: 7 } })).toBe(carrierSunk);

    state = ready(['flare', 'flare'], [[glass, base], [base]]);
    state = queue(state, 'p1', 'p2', flare());
    const traced = queue(state, 'p1', 'p2', { type: 'tracer', center: { row: 4, column: 4 } });
    expect(traced.roundPlans[0].uses.at(-1).kind).toBe('tracer');
    const deadGlass = { ...state, participants: state.participants.map((participant) => participant.id === 'p1' ? { ...participant, ships: participant.ships.map((item) => item.special === 'glass-cannon' ? { ...item, sunk: true, damage: [1] } : item) } : participant) };
    expect(queue(deadGlass, 'p1', 'p2', { type: 'tracer', center: { row: 4, column: 4 } })).toBe(deadGlass);

    state = ready(['flare', 'flare'], [[base], [glass, base]], 1);
    state = queue(state, 'p1', 'p2', flare());
    const pressured = queue(state, 'p1', 'p2', { type: 'explosive', boardSize: 10, turnIndex: 0, center: { row: 4, column: 4 } });
    expect(pressured.roundPlans[0].uses.at(-1).kind).toBe('pressure');
    expect(queue(pressured, 'p1', 'p2', { type: 'explosive', boardSize: 10, turnIndex: 0, center: { row: 5, column: 5 } })).toBe(pressured);
    const pressureGone = { ...state, participants: state.participants.map((participant) => participant.id === 'p2' ? { ...participant, ships: participant.ships.map((item) => item.special === 'glass-cannon' ? { ...item, sunk: true, damage: [1] } : item) } : participant) };
    expect(queue(pressureGone, 'p1', 'p2', { type: 'explosive', boardSize: 10, turnIndex: 0, center: { row: 4, column: 4 } })).toBe(pressureGone);

    state = ready(['flare', 'flare'], [[spy, base], [base]]);
    const scouted = reduceFleet(state, 'p1', { type: 'scout-variant-cell', targetParticipantId: 'p2', cell: { row: 3, column: 0 } });
    expect(scouted.privateScouts).toMatchObject([{ ownerId: 'p1', targetId: 'p2', occupied: true }]);
    expect(scouted.shots).toEqual([]); expect(scouted.presentationQueue).toEqual([]); expect(scouted.participants[1].ships).toEqual(state.participants[1].ships);
    expect(projectFleetState(scouted, 'p2').privateScouts).toEqual([]);
    expect(reduceFleet(scouted, 'p1', { type: 'scout-variant-cell', targetParticipantId: 'p2', cell: { row: 4, column: 4 } })).toBe(scouted);
    const resetScout = reduceFleet(scouted, 'p1', { type: 'reset-variant-plan' });
    expect(reduceFleet(resetScout, 'p1', { type: 'scout-variant-cell', targetParticipantId: 'p2', cell: { row: 4, column: 4 } })).toBe(resetScout);
  });

  it('persists carrier first-hit reveal and applies armor, submarine, and paper rules inside simultaneous resolution', () => {
    const base = blueprint('base'), carrier = blueprint('carrier', 'carrier', 1, 5), armor = blueprint('armor', 'armor', 1, 5), submarine = blueprint('submarine', 'submarine', 1, 2), paper = blueprint('paper', 'paper');
    let state = ready(['flare', 'flare'], [[base], [carrier, base]]);
    state = queue(state, 'p1', 'p2', flare({ row: 3, column: 0 }, [{ row: 9, column: 8 }, { row: 9, column: 9 }]));
    state = queue(state, 'p2', 'p1', flare()); state = reduceFleet(state, 'p1', { type: 'submit-variant-plan' }); state = reduceFleet(state, 'p2', { type: 'submit-variant-plan' });
    expect(state.revealedFleetIds).toContain('p2'); expect(projectFleetState(state, 'p1').participants.find(({ id }) => id === 'p2').ships).toHaveLength(2);

    state = ready(['flare', 'flare', 'flare'], [[base], [armor, submarine, paper, base], [base]]);
    state = queue(state, 'p1', 'p2', flare({ row: 3, column: 2 }, [{ row: 9, column: 8 }, { row: 9, column: 9 }]));
    state = queue(state, 'p2', 'p1', flare());
    state = queue(state, 'p3', 'p2', flare({ row: 4, column: 0 }, [{ row: 5, column: 0 }, { row: 9, column: 7 }]));
    state = reduceFleet(reduceFleet(reduceFleet(state, 'p1', { type: 'submit-variant-plan' }), 'p2', { type: 'submit-variant-plan' }), 'p3', { type: 'submit-variant-plan' });
    const targetShots = state.shots.filter(({ target }) => target === 'p2');
    expect(targetShots.find(({ cell }) => cell.row === 3 && cell.column === 2).result).toBe('partial');
    expect(targetShots.find(({ cell }) => cell.row === 4 && cell.column === 0).result).toBe('miss');
    expect(targetShots.find(({ cell }) => cell.row === 5 && cell.column === 0).result).toBe('sunk');
  });
});
