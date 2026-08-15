import { describe, expect, it } from 'vitest';
import {
  SPECIAL_FLEET_CHOICES,
  VARIANT_BASE_FLEET,
  applyFleetImpact,
  assignFleetPlacementTags,
  buildVariantFleet,
  canShipReceivePlacementTag,
  createFleetShipState,
  isFleetTaggedPlacementValid,
  specialAbilitiesForOwner,
  type FleetShipBlueprint,
  type FleetShipState,
} from './fleet-special';

// Causal hypothesis: identity-keyed pure composition, damage, and tag functions can
// express every special rule without mutable global effects or a duplicate reducer.
// Falsifier: owner-local hidden/pressure state or any offered shape cannot be represented.

const sink = (ship: FleetShipState): FleetShipState => ({
  ...ship,
  damage: ship.damage.map((_, index) => ship.special === 'armor' && index === 2 ? 2 : 1),
  sunk: true,
});

describe('M3-FLEET-3 special ships and placement tags', () => {
  it('4/6 defines exactly seven additive choices with the exact shapes, totals, and effects', () => {
    expect(VARIANT_BASE_FLEET.map(({ shape }) => [shape.rows, shape.columns])).toEqual([
      [1, 2], [1, 3], [1, 3], [1, 4], [1, 4], [1, 5],
    ]);
    expect(SPECIAL_FLEET_CHOICES.map(({ kind, addedCellCount, additions, effect }) => ({
      kind,
      addedCellCount,
      shapes: additions.map(({ shape }) => [shape.rows, shape.columns]),
      effect,
    }))).toEqual([
      { kind: 'armor', addedCellCount: 5, shapes: [[1, 5]], effect: 'armored-centers' },
      { kind: 'submarine', addedCellCount: 4, shapes: [[1, 4]], effect: 'hidden-hits' },
      { kind: 'carrier', addedCellCount: 5, shapes: [[1, 5]], effect: 'extra-fire' },
      { kind: 'glass-cannon', addedCellCount: 1, shapes: [[1, 1]], effect: 'tracer-and-pressure' },
      { kind: 'spy', addedCellCount: 4, shapes: [[1, 2], [1, 2]], effect: 'private-scout' },
      { kind: 'supply', addedCellCount: 8, shapes: [[2, 4]], effect: 'survivability' },
      { kind: 'paper', addedCellCount: 7, shapes: [[2, 2], [1, 3]], effect: 'flare-vulnerable' },
    ]);

    for (const choice of SPECIAL_FLEET_CHOICES) {
      const fleet = buildVariantFleet([choice.kind]);
      expect(fleet).toHaveLength(VARIANT_BASE_FLEET.length + choice.additions.length);
      expect(fleet.slice(0, VARIANT_BASE_FLEET.length).map(({ id }) => id)).toEqual(VARIANT_BASE_FLEET.map(({ id }) => id));
      expect(fleet.slice(VARIANT_BASE_FLEET.length).reduce((sum, ship) => sum + ship.shape.rows * ship.shape.columns, 0)).toBe(choice.addedCellCount);
    }
    expect(buildVariantFleet(['armor']).filter(({ special }) => special === 'armor').map(({ shape }) => [shape.rows, shape.columns])).toEqual([[1, 5], [1, 5]]);
  });

  it('5/6 resolves ability lifetime, carrier loss, non-stacking pressure, and private/public damage exceptions', () => {
    const fullFleet = buildVariantFleet(['armor', 'submarine', 'carrier', 'glass-cannon', 'spy', 'paper']);
    const states = fullFleet.map((ship) => createFleetShipState('p1', ship));
    let armor = states.find(({ special }) => special === 'armor')!;
    const partial = applyFleetImpact(armor, { kind: 'damage', cellIndex: 2 });
    expect(partial).toMatchObject({ publicResult: 'partial', privateResult: 'hit', damageApplied: true });
    expect(partial.ship.damage[2]).toBe(1);
    armor = applyFleetImpact(partial.ship, { kind: 'damage', cellIndex: 2 }).ship;
    expect(armor.damage[2]).toBe(2);

    let submarine = states.find(({ special }) => special === 'submarine')!;
    const submarineResults: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const impact = applyFleetImpact(submarine, { kind: 'damage', cellIndex: index });
      submarineResults.push(impact.publicResult!);
      submarine = impact.ship;
    }
    expect(submarineResults).toEqual(['miss', 'miss', 'miss', 'sunk']);

    const spy = states.find(({ special }) => special === 'spy')!;
    const scouted = applyFleetImpact(spy, { kind: 'scout', cellIndex: 0 });
    expect(scouted).toMatchObject({ publicResult: null, privateResult: 'occupied', damageApplied: false });
    expect(scouted.ship).toEqual(spy);
    const paper = states.find(({ special }) => special === 'paper')!;
    expect(applyFleetImpact(paper, { kind: 'flare', cellIndex: 0 })).toMatchObject({ publicResult: 'hit', privateResult: 'hit', damageApplied: true });

    const carrier = states.find(({ special }) => special === 'carrier')!;
    const threeSunk = states.filter(({ id }) => id !== carrier.id).slice(0, 3).map(sink);
    expect(applyFleetImpact(carrier, { kind: 'damage', cellIndex: 0 }).revealOwnerFleet).toBe(true);
    expect(specialAbilitiesForOwner('p1', [carrier]).carrierExtraShots).toBe(1);
    expect(specialAbilitiesForOwner('p1', [carrier, ...threeSunk]).carrierExtraShots).toBe(0);
    expect(specialAbilitiesForOwner('p1', [sink(carrier)]).carrierExtraShots).toBe(0);

    const glassBlueprint = buildVariantFleet(['glass-cannon']).find(({ special }) => special === 'glass-cannon')!;
    const pGlass = createFleetShipState('p', glassBlueprint);
    const qGlass = createFleetShipState('q', glassBlueprint);
    expect(specialAbilitiesForOwner('r', [pGlass, qGlass]).glassCannonPressure).toBe(1);
    expect(specialAbilitiesForOwner('r', [pGlass, qGlass]).glassCannonPressureEveryTurns).toBe(2);
    expect(specialAbilitiesForOwner('p', [sink(pGlass), qGlass]).glassCannonPressure).toBe(1);
    expect(specialAbilitiesForOwner('q', [sink(pGlass), qGlass]).glassCannonPressure).toBe(0);
    expect(specialAbilitiesForOwner('q', [sink(pGlass), qGlass]).glassCannonPressureEveryTurns).toBeNull();
    expect(specialAbilitiesForOwner('p', [sink(pGlass)]).tracerShots).toBe(0);

    const spies = states.filter(({ special }) => special === 'spy');
    expect(specialAbilitiesForOwner('p1', spies).privateScouts).toBe(1);
    expect(specialAbilitiesForOwner('p1', spies.map(sink)).privateScouts).toBe(0);
  });

  it('6/6 assigns caller-selected distinct coastal/ocean tags and validates 12x12 and 10x10 bounds', () => {
    const fleet = buildVariantFleet(SPECIAL_FLEET_CHOICES.map(({ kind }) => kind));
    for (const ship of fleet) {
      expect(canShipReceivePlacementTag(ship, 'coastal', 12)).toBe(true);
      expect(canShipReceivePlacementTag(ship, 'ocean', 12)).toBe(true);
      expect(canShipReceivePlacementTag(ship, 'ocean', 10)).toBe(true);
    }

    const assignment = { coastalShipId: fleet[0]!.id, oceanShipId: fleet[1]!.id };
    const tagged = assignFleetPlacementTags(fleet, assignment, 12);
    expect(tagged.ok).toBe(true);
    if (!tagged.ok) throw new Error(tagged.reason);
    expect(tagged.ships.filter(({ placementTag }) => placementTag === 'coastal')).toHaveLength(1);
    expect(tagged.ships.filter(({ placementTag }) => placementTag === 'ocean')).toHaveLength(1);
    expect(assignFleetPlacementTags(fleet, assignment, 12)).toEqual(tagged);
    expect(assignFleetPlacementTags(fleet, { coastalShipId: fleet[0]!.id, oceanShipId: fleet[0]!.id }, 12)).toEqual({ ok: false, reason: 'tags-require-distinct-ships' });

    const line = fleet.find(({ shape }) => shape.rows === 1 && shape.columns === 5)!;
    expect(isFleetTaggedPlacementValid(line, 'coastal', 12, { row: 0, column: 0 }, 'horizontal')).toBe(true);
    expect(isFleetTaggedPlacementValid(line, 'coastal', 12, { row: 2, column: 2 }, 'horizontal')).toBe(false);
    expect(isFleetTaggedPlacementValid(line, 'ocean', 12, { row: 3, column: 3 }, 'horizontal')).toBe(true);
    expect(isFleetTaggedPlacementValid(line, 'ocean', 12, { row: 2, column: 3 }, 'horizontal')).toBe(false);
    expect(isFleetTaggedPlacementValid(line, 'ocean', 10, { row: 2, column: 2 }, 'horizontal')).toBe(true);
    expect(isFleetTaggedPlacementValid(line, 'ocean', 10, { row: 1, column: 2 }, 'horizontal')).toBe(false);

    const impossible: FleetShipBlueprint = { id: 'too-wide', shape: { rows: 7, columns: 7 }, special: null };
    expect(assignFleetPlacementTags([fleet[0]!, impossible], { coastalShipId: fleet[0]!.id, oceanShipId: impossible.id }, 12)).toEqual({ ok: false, reason: 'ocean-ship-ineligible' });
  });
});
