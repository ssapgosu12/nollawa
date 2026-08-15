export const FLEET_BOARD_SIZE = 9 as const;
export const CLASSIC_FLEET_LENGTHS = [2, 3, 3, 4, 5] as const;

export interface FleetCell { row: number; column: number }
export type FleetOrientation = 'horizontal' | 'vertical';
export type FleetShotType = 'classic';
export type FleetShotResult = 'hit' | 'miss' | 'sunk';

export interface FleetShip {
  index: number;
  length: number;
  orientation: FleetOrientation;
  cells: readonly FleetCell[];
}

export interface FleetParticipant {
  id: string;
  name: string;
  ships: readonly FleetShip[];
  placementComplete: boolean;
  alive: boolean;
}

export interface FleetShot {
  shooter: string;
  target: string;
  cell: FleetCell;
  shotType: FleetShotType;
  result: FleetShotResult;
}

export interface FleetState {
  kind: 'fleet';
  boardSize: typeof FLEET_BOARD_SIZE;
  participants: readonly FleetParticipant[];
  placementParticipantId: string | null;
  turnParticipantId: string | null;
  shots: readonly FleetShot[];
  phase: 'placement' | 'targeting' | 'complete';
  winnerId: string | null;
}

export type FleetAction =
  | { type: 'place-ship'; shipIndex: number; origin: FleetCell; orientation: FleetOrientation }
  | { type: 'rotate-ship'; shipIndex: number }
  | { type: 'complete-placement' }
  | { type: 'shoot'; targetParticipantId: string; cell: FleetCell; shotType: FleetShotType };

export const isFleetAction = (value: unknown): value is FleetAction => Boolean(value && typeof value === 'object'
  && ['place-ship', 'rotate-ship', 'complete-placement', 'shoot'].includes(String((value as { type?: unknown }).type)));

export interface FleetParticipantView {
  id: string;
  name: string;
  placementComplete: boolean;
  alive: boolean;
  ships?: readonly FleetShip[];
}

export interface FleetView extends Omit<FleetState, 'participants'> {
  participants: readonly FleetParticipantView[];
}

const cellKey = ({ row, column }: FleetCell) => `${row}:${column}`;
const sameCell = (left: FleetCell, right: FleetCell) => left.row === right.row && left.column === right.column;
const validCell = ({ row, column }: FleetCell) => Number.isInteger(row) && Number.isInteger(column) && row >= 0 && row < FLEET_BOARD_SIZE && column >= 0 && column < FLEET_BOARD_SIZE;

function validateParticipants(participants: readonly Pick<FleetParticipant, 'id' | 'name'>[]): void {
  if (participants.length < 2 || participants.length > 6) throw new RangeError('Fleet Strike requires 2-6 participants');
  const ids = new Set<string>();
  for (const participant of participants) {
    if (!participant.id || !participant.name || ids.has(participant.id)) throw new RangeError('Fleet Strike participants require unique non-empty ids and names');
    ids.add(participant.id);
  }
}

export function createFleetState(participants: readonly Pick<FleetParticipant, 'id' | 'name'>[]): FleetState {
  validateParticipants(participants);
  return {
    kind: 'fleet', boardSize: FLEET_BOARD_SIZE,
    participants: participants.map(({ id, name }) => ({ id, name, ships: [], placementComplete: false, alive: true })),
    placementParticipantId: participants[0]!.id, turnParticipantId: null, shots: [], phase: 'placement', winnerId: null,
  };
}

export function isFleetState(value: unknown): value is FleetState {
  return Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'fleet'
    && (value as { boardSize?: unknown }).boardSize === FLEET_BOARD_SIZE && Array.isArray((value as { participants?: unknown }).participants));
}

export function fleetShipCells(length: number, origin: FleetCell, orientation: FleetOrientation): readonly FleetCell[] {
  return Array.from({ length }, (_, offset) => ({
    row: origin.row + (orientation === 'vertical' ? offset : 0),
    column: origin.column + (orientation === 'horizontal' ? offset : 0),
  }));
}

function placeShip(state: FleetState, actorId: string, action: Extract<FleetAction, { type: 'place-ship' }>): FleetState {
  if (state.phase !== 'placement' || state.placementParticipantId !== actorId) return state;
  const expectedLength = CLASSIC_FLEET_LENGTHS[action.shipIndex];
  if (expectedLength === undefined) return state;
  const cells = fleetShipCells(expectedLength, action.origin, action.orientation);
  if (!cells.every(validCell)) return state;
  const participantIndex = state.participants.findIndex(({ id }) => id === actorId);
  const participant = state.participants[participantIndex];
  if (!participant || participant.placementComplete) return state;
  const occupied = new Set(participant.ships.filter(({ index }) => index !== action.shipIndex).flatMap(({ cells: shipCells }) => shipCells.map(cellKey)));
  if (cells.some((cell) => occupied.has(cellKey(cell)))) return state;
  const ship: FleetShip = { index: action.shipIndex, length: expectedLength, orientation: action.orientation, cells };
  const ships = [...participant.ships.filter(({ index }) => index !== action.shipIndex), ship].sort((a, b) => a.index - b.index);
  const participants = [...state.participants];
  participants[participantIndex] = { ...participant, ships };
  return { ...state, participants };
}

function rotateShip(state: FleetState, actorId: string, shipIndex: number): FleetState {
  const participant = state.participants.find(({ id }) => id === actorId);
  const ship = participant?.ships.find(({ index }) => index === shipIndex);
  if (!ship) return state;
  return placeShip(state, actorId, {
    type: 'place-ship', shipIndex, origin: ship.cells[0]!,
    orientation: ship.orientation === 'horizontal' ? 'vertical' : 'horizontal',
  });
}

function completePlacement(state: FleetState, actorId: string): FleetState {
  if (state.phase !== 'placement' || state.placementParticipantId !== actorId) return state;
  const participantIndex = state.participants.findIndex(({ id }) => id === actorId);
  const participant = state.participants[participantIndex];
  if (!participant || participant.ships.length !== CLASSIC_FLEET_LENGTHS.length) return state;
  const participants = [...state.participants];
  participants[participantIndex] = { ...participant, placementComplete: true };
  const next = participants.find(({ placementComplete }) => !placementComplete);
  return next
    ? { ...state, participants, placementParticipantId: next.id }
    : { ...state, participants, placementParticipantId: null, turnParticipantId: participants[0]!.id, phase: 'targeting' };
}

const hitKeysFor = (shots: readonly FleetShot[], target: string) => new Set(shots.filter((shot) => shot.target === target && shot.result !== 'miss').map(({ cell }) => cellKey(cell)));

function shoot(state: FleetState, actorId: string, action: Extract<FleetAction, { type: 'shoot' }>): FleetState {
  if (state.phase !== 'targeting' || state.turnParticipantId !== actorId || action.shotType !== 'classic' || !validCell(action.cell)) return state;
  const targetIndex = state.participants.findIndex(({ id }) => id === action.targetParticipantId);
  const target = state.participants[targetIndex];
  if (!target || !target.alive || target.id === actorId || state.shots.some((shot) => shot.shooter === actorId && shot.target === target.id && sameCell(shot.cell, action.cell))) return state;
  const hitShip = target.ships.find(({ cells }) => cells.some((cell) => sameCell(cell, action.cell)));
  const provisional: FleetShot = { shooter: actorId, target: target.id, cell: { ...action.cell }, shotType: 'classic', result: hitShip ? 'hit' : 'miss' };
  const hits = hitKeysFor([...state.shots, provisional], target.id);
  const result: FleetShotResult = hitShip && hitShip.cells.every((cell) => hits.has(cellKey(cell))) ? 'sunk' : provisional.result;
  const shots = [...state.shots, { ...provisional, result }];
  const alive = !target.ships.every(({ cells }) => cells.every((cell) => hits.has(cellKey(cell))));
  const participants = [...state.participants];
  participants[targetIndex] = { ...target, alive };
  const survivors = participants.filter((participant) => participant.alive);
  if (survivors.length === 1) return { ...state, participants, shots, phase: 'complete', turnParticipantId: null, winnerId: survivors[0]!.id };
  const shooterIndex = participants.findIndex(({ id }) => id === actorId);
  const next = Array.from({ length: participants.length - 1 }, (_, offset) => participants[(shooterIndex + offset + 1) % participants.length]!).find(({ alive: candidateAlive }) => candidateAlive)!;
  return { ...state, participants, shots, turnParticipantId: next.id };
}

export function reduceFleet(state: FleetState, actorId: string, action: FleetAction): FleetState {
  if (action.type === 'place-ship') return placeShip(state, actorId, action);
  if (action.type === 'rotate-ship') return rotateShip(state, actorId, action.shipIndex);
  if (action.type === 'complete-placement') return completePlacement(state, actorId);
  return shoot(state, actorId, action);
}

export const fleetActorId = (state: FleetState): string | null => state.phase === 'placement' ? state.placementParticipantId : state.turnParticipantId;

export function projectFleetState(state: FleetState, viewerParticipantId?: string): FleetView {
  return {
    ...state,
    participants: state.participants.map((participant) => {
      const common = { id: participant.id, name: participant.name, placementComplete: participant.placementComplete, alive: participant.alive };
      return participant.id === viewerParticipantId ? { ...common, ships: participant.ships.map((ship) => ({ ...ship, cells: ship.cells.map((cell) => ({ ...cell })) })) } : common;
    }),
    shots: state.shots.map((shot) => ({ ...shot, cell: { ...shot.cell } })),
  };
}
