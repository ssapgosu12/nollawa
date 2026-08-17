import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ cursor: 0, values: [] }));
vi.mock('preact/hooks', () => ({
  useEffect() {},
  useState(initial) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.values[index], (next) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next; }];
  },
}));

import { FleetGame } from './components/FleetGame';
import { createVariantFleetState, reduceFleet } from './game/fleet';

const people = [{ id: 'p1', name: '1P' }, { id: 'p2', name: '2P' }];
const blueprint = (id, special = null, rows = 1, columns = 1, placementTag = null) => ({ id, special, shape: { rows, columns }, placementTag });
const ship = (item, index, row = index) => ({
  index, length: item.shape.rows * item.shape.columns, orientation: 'horizontal', special: item.special,
  blueprintId: item.id, placementTag: item.placementTag, cells: Array.from({ length: item.shape.rows * item.shape.columns }, (_, column) => ({ row, column })),
  damage: Array.from({ length: item.shape.rows * item.shape.columns }, () => 0), sunk: false,
});
const ready = ({ round = 1, card = 'flare', ownFleet = [blueprint('base')], enemyFleet = [blueprint('glass', 'glass-cannon')] } = {}) => {
  const state = createVariantFleetState(people, () => .25);
  const fleets = [ownFleet, enemyFleet];
  return {
    ...state, phase: 'targeting', setupParticipantId: null, placementParticipantId: null, turnParticipantId: 'p1', round,
    participants: state.participants.map((participant, participantIndex) => ({
      ...participant, placementComplete: true,
      variantSetup: { ...participant.variantSetup, shootingCard: participantIndex === 0 ? card : 'flare', complete: true, fleet: fleets[participantIndex] },
      ships: fleets[participantIndex].map((item, index) => ship(item, index, participantIndex * 4 + index)),
    })),
  };
};
const render = (state) => { hooks.cursor = 0; return FleetGame({ state, viewerId: 'p1', onAction() {}, onExit() {} }); };
const nodes = (node) => node == null || typeof node === 'boolean' ? [] : Array.isArray(node) ? node.flatMap(nodes) : typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const text = (node) => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node);
const buttons = (tree) => nodes(tree).filter((node) => node.type === 'button');
const button = (tree, label) => buttons(tree).find((node) => text(node) === label);

beforeEach(() => { hooks.cursor = 0; hooks.values = []; });

describe('M3-FLEET-MIDBAR population 4 state behavior', () => {
  it('B-3 keeps reducer and screen parity aligned: pressure is a five-cell cross on the allowed round and unavailable on the rest round', () => {
    const basePlan = { type: 'flare', normalCell: { row: 8, column: 8 }, flareCells: [{ row: 8, column: 7 }, { row: 8, column: 9 }] };
    const pressure = (turnIndex) => ({ type: 'explosive', boardSize: 10, turnIndex, center: { row: 4, column: 4 } });
    let allowed = reduceFleet(ready({ round: 1 }), 'p1', { type: 'queue-variant-shot', targetParticipantId: 'p2', plan: basePlan });
    allowed = reduceFleet(allowed, 'p1', { type: 'queue-variant-shot', targetParticipantId: 'p2', plan: pressure(0) });
    const pressureImpacts = allowed.roundPlans[0].impacts.slice(3).map(({ cell }) => `${cell.row},${cell.column}`);
    expect(new Set(pressureImpacts)).toEqual(new Set(['4,4', '3,4', '5,4', '4,3', '4,5']));
    expect(allowed.roundPlans[0].uses.at(-1).kind).toBe('pressure');
    expect(button(render(ready({ round: 1 })), '압박 고폭탄')).toBeDefined();

    let rest = reduceFleet(ready({ round: 2 }), 'p1', { type: 'queue-variant-shot', targetParticipantId: 'p2', plan: basePlan });
    const refused = reduceFleet(rest, 'p1', { type: 'queue-variant-shot', targetParticipantId: 'p2', plan: pressure(1) });
    expect(refused).toBe(rest);
    expect(button(render(ready({ round: 2 })), '압박 고폭탄')).toBeUndefined();
  });

  it('B-18 renders the most crowded state with every middle-bar label whole and represented once', () => {
    const ownFleet = [blueprint('carrier', 'carrier'), blueprint('glass', 'glass-cannon'), blueprint('spy', 'spy', 1, 2), blueprint('base')];
    let tree = render(ready({ round: 1, card: 'buckshot', ownFleet }));
    button(tree, '산탄 6발').props.onClick();
    tree = render(ready({ round: 1, card: 'buckshot', ownFleet }));
    const expected = ['일반탄 1발', '산탄 6발', '항모 추가탄', '추가 예광탄', '비공개 정찰', '압박 고폭탄', '확인', '모든 발 회수', '사격 확정', '나가기'];
    for (const label of expected) expect(buttons(tree).filter((item) => text(item) === label)).toHaveLength(1);
    expect(expected.every((label) => !label.includes('\n'))).toBe(true);
  });

  it('B-24 derives a visible non-yellow completion state for every placed ship and a distinct state for every unplaced ship', () => {
    const fleet = Array.from({ length: 6 }, (_, index) => blueprint(`함선-${index + 1}`, null, 1, index % 2 + 1, index === 1 ? 'coastal' : null));
    const target = ready({ card: 'buckshot', ownFleet: fleet });
    const placement = {
      ...target, phase: 'placement', placementParticipantId: 'p1', roundPlans: [],
      participants: target.participants.map((participant) => participant.id === 'p1' ? { ...participant, ships: [ship(fleet[0], 0), ship(fleet[2], 2), ship(fleet[4], 4)] } : participant),
    };
    const picker = nodes(render(placement)).find((node) => node.props?.['aria-label'] === '배 선택');
    const choices = nodes(picker).filter((node) => node.type === 'button');
    expect(choices).toHaveLength(6);
    choices.forEach((choice, index) => {
      const placed = [0, 2, 4].includes(index);
      expect(choice.props.class.includes(placed ? 'placed' : 'unplaced')).toBe(true);
      expect(text(choice).includes(placed ? '배치됨' : '미배치')).toBe(true);
    });
  });

  it('B-33 renders two adjacent firing-choice boxes and keeps exactly one selected through both directions', () => {
    let tree = render(ready({ card: 'buckshot' }));
    const group = nodes(tree).find((node) => node.props?.['aria-label'] === '산탄 발사 선택');
    expect(nodes(group).filter((node) => node.type === 'button').map(text)).toEqual(['일반탄 1발', '산탄 6발']);
    expect(nodes(group).filter((node) => node.type === 'button' && node.props['aria-pressed'])).toHaveLength(1);
    button(tree, '산탄 6발').props.onClick();
    tree = render(ready({ card: 'buckshot' }));
    expect(button(tree, '일반탄 1발').props['aria-pressed']).toBe(false);
    expect(button(tree, '산탄 6발').props['aria-pressed']).toBe(true);
    button(tree, '일반탄 1발').props.onClick();
    tree = render(ready({ card: 'buckshot' }));
    expect(button(tree, '일반탄 1발').props['aria-pressed']).toBe(true);
    expect(button(tree, '산탄 6발').props['aria-pressed']).toBe(false);
  });
});
