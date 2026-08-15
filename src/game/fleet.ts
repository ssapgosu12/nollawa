export const FLEET_BOARD_SIZE = 9 as const;
export const CLASSIC_FLEET_LENGTHS = [2, 3, 3, 4, 5] as const;
export const VARIANT_FLEET_LENGTHS = [2, 3, 3, 4, 4, 5] as const;
export const VARIANT_BOARD_SIZE_TWO_PLAYER = 10 as const;
export const VARIANT_BOARD_SIZE_MULTIPLAYER = 12 as const;

export const VARIANT_SHOOTING_CARDS = [
  'salvo', 'flare', 'tracer', 'high-explosive', 'scatter', 'piercing', 'random-shot', 'buckshot',
] as const;
export const VARIANT_SPECIAL_SHIPS = [
  'extra-armor', 'submarine', 'aircraft-carrier', 'glass-cannon', 'spy-ship', 'supply-ship', 'paper-ship',
] as const;

export interface FleetCell { row: number; column: number }
export type FleetOrientation = 'horizontal' | 'vertical';
export type FleetMode = 'classic' | 'variant';
export type FleetShootingCard = typeof VARIANT_SHOOTING_CARDS[number];
export type FleetSpecialShipType = typeof VARIANT_SPECIAL_SHIPS[number];
export type FleetShotType = 'classic' | FleetShootingCard;
export type FleetShotResult = 'hit' | 'miss' | 'sunk';

export interface FleetVariantPreset {
  id: string;
  shootingCard: FleetShootingCard;
  specialShipOffers: readonly FleetSpecialShipType[];
}

export interface FleetVariantSetup {
  presetOffers: readonly FleetVariantPreset[];
  selectedPresetId: string | null;
  shootingCard: FleetShootingCard | null;
  selectedSpecialShips: readonly FleetSpecialShipType[];
  complete: boolean;
}

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
  variantSetup?: FleetVariantSetup;
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
  mode: FleetMode;
  boardSize: typeof FLEET_BOARD_SIZE | typeof VARIANT_BOARD_SIZE_TWO_PLAYER | typeof VARIANT_BOARD_SIZE_MULTIPLAYER;
  baseFleetLengths: readonly number[];
  participants: readonly FleetParticipant[];
  setupParticipantId: string | null;
  placementParticipantId: string | null;
  turnParticipantId: string | null;
  shots: readonly FleetShot[];
  phase: 'setup' | 'placement' | 'targeting' | 'complete';
  winnerId: string | null;
}

export type FleetAction =
  | { type: 'choose-variant-preset'; presetId: string }
  | { type: 'choose-special-ships'; specialShips: readonly FleetSpecialShipType[] }
  | { type: 'place-ship'; shipIndex: number; origin: FleetCell; orientation: FleetOrientation }
  | { type: 'rotate-ship'; shipIndex: number }
  | { type: 'complete-placement' }
  | { type: 'shoot'; targetParticipantId: string; cell: FleetCell; shotType: FleetShotType };

export const isFleetAction = (value: unknown): value is FleetAction => Boolean(value && typeof value === 'object'
  && ['choose-variant-preset', 'choose-special-ships', 'place-ship', 'rotate-ship', 'complete-placement', 'shoot'].includes(String((value as { type?: unknown }).type)));

export interface FleetParticipantView {
  id: string;
  name: string;
  placementComplete: boolean;
  alive: boolean;
  ships?: readonly FleetShip[];
  variantSetup?: FleetVariantSetup;
}

export interface FleetView extends Omit<FleetState, 'participants'> {
  participants: readonly FleetParticipantView[];
}

const cellKey = ({ row, column }: FleetCell) => `${row}:${column}`;
const sameCell = (left: FleetCell, right: FleetCell) => left.row === right.row && left.column === right.column;
const validCell = ({ row, column }: FleetCell, boardSize: number) => Number.isInteger(row) && Number.isInteger(column) && row >= 0 && row < boardSize && column >= 0 && column < boardSize;

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
    kind: 'fleet', mode: 'classic', boardSize: FLEET_BOARD_SIZE, baseFleetLengths: CLASSIC_FLEET_LENGTHS,
    participants: participants.map(({ id, name }) => ({ id, name, ships: [], placementComplete: false, alive: true })),
    setupParticipantId: null, placementParticipantId: participants[0]!.id, turnParticipantId: null, shots: [], phase: 'placement', winnerId: null,
  };
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const sample = Math.min(Math.max(random(), 0), 0.9999999999999999);
    const swapIndex = Math.floor(sample * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function variantPresetOffers(participantIndex: number, twoPlayer: boolean, random: () => number): readonly FleetVariantPreset[] {
  const shootingCards = shuffled(VARIANT_SHOOTING_CARDS, random);
  const specialShips = shuffled(VARIANT_SPECIAL_SHIPS, random);
  const offerCount = twoPlayer ? 3 : 4;
  return shootingCards.slice(0, 3).map((shootingCard, presetIndex) => ({
    id: `p${participantIndex + 1}-preset-${presetIndex + 1}`,
    shootingCard,
    specialShipOffers: Array.from({ length: offerCount }, (_, offset) => specialShips[(presetIndex * offerCount + offset) % specialShips.length]!),
  }));
}

export function createVariantFleetState(
  participants: readonly Pick<FleetParticipant, 'id' | 'name'>[],
  random: () => number = Math.random,
): FleetState {
  validateParticipants(participants);
  const twoPlayer = participants.length === 2;
  return {
    kind: 'fleet', mode: 'variant',
    boardSize: twoPlayer ? VARIANT_BOARD_SIZE_TWO_PLAYER : VARIANT_BOARD_SIZE_MULTIPLAYER,
    baseFleetLengths: VARIANT_FLEET_LENGTHS,
    participants: participants.map(({ id, name }, participantIndex) => ({
      id, name, ships: [], placementComplete: false, alive: true,
      variantSetup: {
        presetOffers: variantPresetOffers(participantIndex, twoPlayer, random),
        selectedPresetId: null, shootingCard: null, selectedSpecialShips: [], complete: false,
      },
    })),
    setupParticipantId: participants[0]!.id, placementParticipantId: null, turnParticipantId: null,
    shots: [], phase: 'setup', winnerId: null,
  };
}

export function isFleetState(value: unknown): value is FleetState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; mode?: unknown; boardSize?: unknown; participants?: unknown };
  return Boolean(candidate.kind === 'fleet' && Array.isArray(candidate.participants)
    && ((candidate.mode === 'classic' && candidate.boardSize === FLEET_BOARD_SIZE)
      || (candidate.mode === 'variant' && [VARIANT_BOARD_SIZE_TWO_PLAYER, VARIANT_BOARD_SIZE_MULTIPLAYER].includes(candidate.boardSize as 10 | 12))));
}

export function fleetShipCells(length: number, origin: FleetCell, orientation: FleetOrientation): readonly FleetCell[] {
  return Array.from({ length }, (_, offset) => ({
    row: origin.row + (orientation === 'vertical' ? offset : 0),
    column: origin.column + (orientation === 'horizontal' ? offset : 0),
  }));
}

function placeShip(state: FleetState, actorId: string, action: Extract<FleetAction, { type: 'place-ship' }>): FleetState {
  if (state.phase !== 'placement' || state.placementParticipantId !== actorId) return state;
  const expectedLength = state.baseFleetLengths[action.shipIndex];
  if (expectedLength === undefined) return state;
  const cells = fleetShipCells(expectedLength, action.origin, action.orientation);
  if (!cells.every((cell) => validCell(cell, state.boardSize))) return state;
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
  if (!participant || participant.ships.length !== state.baseFleetLengths.length) return state;
  const participants = [...state.participants];
  participants[participantIndex] = { ...participant, placementComplete: true };
  const next = participants.find(({ placementComplete }) => !placementComplete);
  return next
    ? { ...state, participants, placementParticipantId: next.id }
    : { ...state, participants, placementParticipantId: null, turnParticipantId: participants[0]!.id, phase: 'targeting' };
}

const hitKeysFor = (shots: readonly FleetShot[], target: string) => new Set(shots.filter((shot) => shot.target === target && shot.result !== 'miss').map(({ cell }) => cellKey(cell)));

function shoot(state: FleetState, actorId: string, action: Extract<FleetAction, { type: 'shoot' }>): FleetState {
  if (state.phase !== 'targeting' || state.turnParticipantId !== actorId || action.shotType !== 'classic' || !validCell(action.cell, state.boardSize)) return state;
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

function chooseVariantPreset(state: FleetState, actorId: string, presetId: string): FleetState {
  if (state.mode !== 'variant' || state.phase !== 'setup' || state.setupParticipantId !== actorId) return state;
  const participantIndex = state.participants.findIndex(({ id }) => id === actorId);
  const participant = state.participants[participantIndex];
  const preset = participant?.variantSetup?.presetOffers.find(({ id }) => id === presetId);
  if (!participant || !participant.variantSetup || !preset || participant.variantSetup.complete) return state;
  const participants = [...state.participants];
  participants[participantIndex] = {
    ...participant,
    variantSetup: {
      ...participant.variantSetup, selectedPresetId: preset.id, shootingCard: preset.shootingCard, selectedSpecialShips: [],
    },
  };
  return { ...state, participants };
}

function chooseSpecialShips(state: FleetState, actorId: string, selected: readonly FleetSpecialShipType[]): FleetState {
  if (state.mode !== 'variant' || state.phase !== 'setup' || state.setupParticipantId !== actorId) return state;
  const participantIndex = state.participants.findIndex(({ id }) => id === actorId);
  const participant = state.participants[participantIndex];
  const setup = participant?.variantSetup;
  const preset = setup?.presetOffers.find(({ id }) => id === setup.selectedPresetId);
  const choiceCount = state.participants.length === 2 ? 1 : 2;
  if (!participant || !setup || !preset || setup.complete || selected.length !== choiceCount
    || new Set(selected).size !== selected.length || selected.some((ship) => !preset.specialShipOffers.includes(ship))) return state;
  const participants = [...state.participants];
  participants[participantIndex] = {
    ...participant,
    variantSetup: { ...setup, selectedSpecialShips: [...selected], complete: true },
  };
  const next = participants.find(({ variantSetup }) => !variantSetup?.complete);
  return next
    ? { ...state, participants, setupParticipantId: next.id }
    : { ...state, participants, setupParticipantId: null, placementParticipantId: participants[0]!.id, phase: 'placement' };
}

export function reduceFleet(state: FleetState, actorId: string, action: FleetAction): FleetState {
  if (action.type === 'choose-variant-preset') return chooseVariantPreset(state, actorId, action.presetId);
  if (action.type === 'choose-special-ships') return chooseSpecialShips(state, actorId, action.specialShips);
  if (action.type === 'place-ship') return placeShip(state, actorId, action);
  if (action.type === 'rotate-ship') return rotateShip(state, actorId, action.shipIndex);
  if (action.type === 'complete-placement') return completePlacement(state, actorId);
  return shoot(state, actorId, action);
}

export const fleetActorId = (state: FleetState): string | null => state.phase === 'setup'
  ? state.setupParticipantId
  : state.phase === 'placement' ? state.placementParticipantId : state.turnParticipantId;

export function projectFleetState(state: FleetState, viewerParticipantId?: string): FleetView {
  return {
    ...state,
    participants: state.participants.map((participant) => {
      const common = { id: participant.id, name: participant.name, placementComplete: participant.placementComplete, alive: participant.alive };
      return participant.id === viewerParticipantId ? {
        ...common,
        ships: participant.ships.map((ship) => ({ ...ship, cells: ship.cells.map((cell) => ({ ...cell })) })),
        ...(participant.variantSetup ? { variantSetup: {
          ...participant.variantSetup,
          presetOffers: participant.variantSetup.presetOffers.map((preset) => ({ ...preset, specialShipOffers: [...preset.specialShipOffers] })),
          selectedSpecialShips: [...participant.variantSetup.selectedSpecialShips],
        } } : {}),
      } : common;
    }),
    shots: state.shots.map((shot) => ({ ...shot, cell: { ...shot.cell } })),
  };
}
