import type { FleetCell as ClassicFleetCell, FleetOrientation } from './fleet';

export type FleetSpecialKind = 'armor' | 'submarine' | 'carrier' | 'glass-cannon' | 'spy' | 'supply' | 'paper';
export type FleetSpecialEffect = 'armored-centers' | 'hidden-hits' | 'extra-fire' | 'tracer-and-pressure' | 'private-scout' | 'survivability' | 'flare-vulnerable';
export type FleetPlacementTag = 'coastal' | 'ocean';
export type FleetPlacementOrientation = FleetOrientation;
export type FleetCell = ClassicFleetCell;

export interface FleetShipShape { rows: number; columns: number }

export interface FleetShipBlueprint {
  id: string;
  shape: FleetShipShape;
  special: FleetSpecialKind | null;
}

export interface FleetSpecialChoice {
  kind: FleetSpecialKind;
  effect: FleetSpecialEffect;
  additions: readonly FleetShipBlueprint[];
  addedCellCount: number;
}

export interface FleetShipState extends FleetShipBlueprint {
  ownerId: string;
  damage: readonly number[];
  sunk: boolean;
}

export interface FleetTaggedShip extends FleetShipBlueprint {
  placementTag: FleetPlacementTag | null;
}

export type FleetPublicImpact = 'hit' | 'miss' | 'partial' | 'sunk' | 'revealed' | null;
export type FleetPrivateImpact = 'hit' | 'miss' | 'sunk' | 'occupied' | 'ignored';
export type FleetImpact = { kind: 'damage' | 'flare' | 'scout'; cellIndex: number };

export interface FleetImpactResult {
  ship: FleetShipState;
  publicResult: FleetPublicImpact;
  privateResult: FleetPrivateImpact;
  damageApplied: boolean;
  revealOwnerFleet: boolean;
}

export interface FleetSpecialAbilities {
  carrierExtraShots: 0 | 1;
  tracerShots: 0 | 1;
  privateScouts: 0 | 1;
  glassCannonPressure: 0 | 1;
  glassCannonPressureEveryTurns: 2 | null;
}

export type FleetTagAssignmentResult =
  | { ok: true; ships: readonly FleetTaggedShip[] }
  | { ok: false; reason: 'tags-require-distinct-ships' | 'coastal-ship-not-found' | 'ocean-ship-not-found' | 'coastal-ship-ineligible' | 'ocean-ship-ineligible' };

const ship = (id: string, rows: number, columns: number, special: FleetSpecialKind | null = null): FleetShipBlueprint => ({
  id, shape: { rows, columns }, special,
});

export const VARIANT_BASE_FLEET: readonly FleetShipBlueprint[] = [
  ship('base-2', 1, 2),
  ship('base-3-a', 1, 3),
  ship('base-3-b', 1, 3),
  ship('base-4-a', 1, 4),
  ship('base-4-b', 1, 4),
  ship('base-5', 1, 5),
];

export const SPECIAL_FLEET_CHOICES: readonly FleetSpecialChoice[] = [
  { kind: 'armor', effect: 'armored-centers', additions: [ship('armor-5', 1, 5, 'armor')], addedCellCount: 5 },
  { kind: 'submarine', effect: 'hidden-hits', additions: [ship('submarine-4', 1, 4, 'submarine')], addedCellCount: 4 },
  { kind: 'carrier', effect: 'extra-fire', additions: [ship('carrier-5', 1, 5, 'carrier')], addedCellCount: 5 },
  { kind: 'glass-cannon', effect: 'tracer-and-pressure', additions: [ship('glass-cannon-1', 1, 1, 'glass-cannon')], addedCellCount: 1 },
  { kind: 'spy', effect: 'private-scout', additions: [ship('spy-2-a', 1, 2, 'spy'), ship('spy-2-b', 1, 2, 'spy')], addedCellCount: 4 },
  { kind: 'supply', effect: 'survivability', additions: [ship('supply-8', 2, 4, 'supply')], addedCellCount: 8 },
  { kind: 'paper', effect: 'flare-vulnerable', additions: [ship('paper-4', 2, 2, 'paper'), ship('paper-3', 1, 3, 'paper')], addedCellCount: 7 },
];

const cellCount = ({ shape }: Pick<FleetShipBlueprint, 'shape'>) => shape.rows * shape.columns;
const copyBlueprint = ({ id, shape, special }: FleetShipBlueprint): FleetShipBlueprint => ({ id, shape: { ...shape }, special });

export function buildVariantFleet(selectedKinds: readonly FleetSpecialKind[]): readonly FleetShipBlueprint[] {
  if (new Set(selectedKinds).size !== selectedKinds.length) throw new RangeError('special choices must be distinct');
  const selected = selectedKinds.map((kind) => {
    const choice = SPECIAL_FLEET_CHOICES.find((candidate) => candidate.kind === kind);
    if (!choice) throw new RangeError(`unknown special choice: ${kind}`);
    return choice;
  });
  const armorSelected = selectedKinds.includes('armor');
  const base = VARIANT_BASE_FLEET.map((blueprint) => ({
    ...copyBlueprint(blueprint),
    special: armorSelected && blueprint.id === 'base-5' ? 'armor' as const : blueprint.special,
  }));
  return [...base, ...selected.flatMap(({ additions }) => additions.map(copyBlueprint))];
}

export function createFleetShipState(ownerId: string, blueprint: FleetShipBlueprint): FleetShipState {
  if (!ownerId) throw new RangeError('ship owner id is required');
  return { ...copyBlueprint(blueprint), ownerId, damage: Array.from({ length: cellCount(blueprint) }, () => 0), sunk: false };
}

const damageCapacity = (shipState: FleetShipState, cellIndex: number) => shipState.special === 'armor' && cellIndex === 2 ? 2 : 1;

export function applyFleetImpact(shipState: FleetShipState, impact: FleetImpact): FleetImpactResult {
  if (!Number.isInteger(impact.cellIndex) || impact.cellIndex < 0 || impact.cellIndex >= shipState.damage.length) {
    throw new RangeError('impact cell is outside the ship');
  }
  if (impact.kind === 'scout') {
    return { ship: shipState, publicResult: null, privateResult: 'occupied', damageApplied: false, revealOwnerFleet: false };
  }
  if (shipState.sunk) {
    return { ship: shipState, publicResult: null, privateResult: 'ignored', damageApplied: false, revealOwnerFleet: false };
  }
  if (impact.kind === 'flare' && shipState.special !== 'paper') {
    return { ship: shipState, publicResult: 'revealed', privateResult: 'occupied', damageApplied: false, revealOwnerFleet: false };
  }

  const capacity = damageCapacity(shipState, impact.cellIndex);
  const previousDamage = shipState.damage[impact.cellIndex] ?? 0;
  if (previousDamage >= capacity) {
    const publicResult = shipState.special === 'submarine' ? 'miss' : 'hit';
    return { ship: shipState, publicResult, privateResult: 'hit', damageApplied: false, revealOwnerFleet: false };
  }
  const damage = [...shipState.damage];
  damage[impact.cellIndex] = previousDamage + 1;
  const sunk = damage.every((amount, index) => amount >= damageCapacity(shipState, index));
  const nextShip = { ...shipState, damage, sunk };
  const firstArmorCenterHit = shipState.special === 'armor' && impact.cellIndex === 2 && damage[impact.cellIndex] === 1;
  const publicResult: FleetPublicImpact = shipState.special === 'submarine'
    ? (sunk ? 'sunk' : 'miss')
    : firstArmorCenterHit ? 'partial' : sunk ? 'sunk' : 'hit';
  return {
    ship: nextShip,
    publicResult,
    privateResult: sunk ? 'sunk' : 'hit',
    damageApplied: true,
    revealOwnerFleet: shipState.special === 'carrier',
  };
}

export function specialAbilitiesForOwner(ownerId: string, ships: readonly FleetShipState[]): FleetSpecialAbilities {
  const ownShips = ships.filter((candidate) => candidate.ownerId === ownerId);
  const ownSunkCount = ownShips.filter(({ sunk }) => sunk).length;
  const activeOwn = (special: FleetSpecialKind) => ownShips.some((candidate) => candidate.special === special && !candidate.sunk);
  return {
    carrierExtraShots: activeOwn('carrier') && ownSunkCount < 3 ? 1 : 0,
    tracerShots: activeOwn('glass-cannon') ? 1 : 0,
    privateScouts: activeOwn('spy') ? 1 : 0,
    glassCannonPressure: ships.some((candidate) => candidate.ownerId !== ownerId && candidate.special === 'glass-cannon' && !candidate.sunk) ? 1 : 0,
    glassCannonPressureEveryTurns: ships.some((candidate) => candidate.ownerId !== ownerId && candidate.special === 'glass-cannon' && !candidate.sunk) ? 2 : null,
  };
}

function placementCells(blueprint: FleetShipBlueprint, origin: FleetCell, orientation: FleetPlacementOrientation): readonly FleetCell[] {
  const rows = orientation === 'horizontal' ? blueprint.shape.rows : blueprint.shape.columns;
  const columns = orientation === 'horizontal' ? blueprint.shape.columns : blueprint.shape.rows;
  return Array.from({ length: rows * columns }, (_, index) => ({
    row: origin.row + Math.floor(index / columns),
    column: origin.column + index % columns,
  }));
}

export function isFleetTaggedPlacementValid(
  blueprint: FleetShipBlueprint,
  tag: FleetPlacementTag,
  boardSize: 10 | 12,
  origin: FleetCell,
  orientation: FleetPlacementOrientation,
): boolean {
  const cells = placementCells(blueprint, origin, orientation);
  if (!cells.every(({ row, column }) => Number.isInteger(row) && Number.isInteger(column) && row >= 0 && column >= 0 && row < boardSize && column < boardSize)) return false;
  if (tag === 'coastal') {
    return cells.every(({ row, column }) => row < 2 || column < 2 || row >= boardSize - 2 || column >= boardSize - 2);
  }
  const margin = boardSize === 12 ? 3 : 2;
  return cells.every(({ row, column }) => row >= margin && column >= margin && row < boardSize - margin && column < boardSize - margin);
}

export function canShipReceivePlacementTag(blueprint: FleetShipBlueprint, tag: FleetPlacementTag, boardSize: 10 | 12): boolean {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    for (let row = 0; row < boardSize; row += 1) {
      for (let column = 0; column < boardSize; column += 1) {
        if (isFleetTaggedPlacementValid(blueprint, tag, boardSize, { row, column }, orientation)) return true;
      }
    }
  }
  return false;
}

export function assignFleetPlacementTags(
  ships: readonly FleetShipBlueprint[],
  assignment: { coastalShipId: string; oceanShipId: string },
  boardSize: 10 | 12,
): FleetTagAssignmentResult {
  if (assignment.coastalShipId === assignment.oceanShipId) return { ok: false, reason: 'tags-require-distinct-ships' };
  const coastal = ships.find(({ id }) => id === assignment.coastalShipId);
  if (!coastal) return { ok: false, reason: 'coastal-ship-not-found' };
  const ocean = ships.find(({ id }) => id === assignment.oceanShipId);
  if (!ocean) return { ok: false, reason: 'ocean-ship-not-found' };
  if (!canShipReceivePlacementTag(coastal, 'coastal', boardSize)) return { ok: false, reason: 'coastal-ship-ineligible' };
  if (!canShipReceivePlacementTag(ocean, 'ocean', boardSize)) return { ok: false, reason: 'ocean-ship-ineligible' };
  return {
    ok: true,
    ships: ships.map((blueprint) => ({
      ...copyBlueprint(blueprint),
      placementTag: blueprint.id === coastal.id ? 'coastal' : blueprint.id === ocean.id ? 'ocean' : null,
    })),
  };
}
