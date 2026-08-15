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
export type FleetShotType = 'classic' | 'bonus-normal' | FleetShootingCard;
export type FleetShotResult = 'hit' | 'miss' | 'sunk' | 'partial';

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
  fleet?: readonly FleetTaggedShip[];
  tagOffset: number;
}

export interface FleetShip {
  index: number;
  length: number;
  orientation: FleetOrientation;
  cells: readonly FleetCell[];
  blueprintId?: string;
  special?: FleetSpecialKind | null;
  placementTag?: FleetPlacementTag | null;
  damage?: readonly number[];
  sunk?: boolean;
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
  round?: number;
  impactKind?: FleetImpactKind;
}

export interface FleetVariantImpact { targetParticipantId: string; cell: FleetCell; kind: FleetImpactKind; shotType: FleetShotType }
export type FleetVariantUseKind = 'card' | 'carrier' | 'tracer' | 'pressure' | 'spy';
export interface FleetVariantUse { kind: FleetVariantUseKind; targetParticipantId: string }
export interface FleetRoundPlan { participantId: string; impacts: readonly FleetVariantImpact[]; submitted: boolean; uses?: readonly FleetVariantUse[] }
export interface FleetPresentation { kind: 'caption' | 'result'; text: string; attackerId: string; targetId: string }
export interface FleetPrivateScout { ownerId: string; targetId: string; cell: FleetCell; occupied: boolean; round: number }

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
  draw?: boolean;
  round?: number;
  roundPlans?: readonly FleetRoundPlan[];
  presentationQueue?: readonly FleetPresentation[];
  privateScouts?: readonly FleetPrivateScout[];
  revealedFleetIds?: readonly string[];
}

export type FleetAction =
  | { type: 'choose-variant-preset'; presetId: string }
  | { type: 'choose-special-ships'; specialShips: readonly FleetSpecialShipType[] }
  | { type: 'place-ship'; shipIndex: number; origin: FleetCell; orientation: FleetOrientation }
  | { type: 'rotate-ship'; shipIndex: number }
  | { type: 'complete-placement' }
  | { type: 'queue-variant-shot'; targetParticipantId: string; plan: FleetShotPlan }
  | { type: 'scout-variant-cell'; targetParticipantId: string; cell: FleetCell }
  | { type: 'reset-variant-plan' }
  | { type: 'submit-variant-plan' }
  | { type: 'shoot'; targetParticipantId: string; cell: FleetCell; shotType: FleetShotType };

export const isFleetAction = (value: unknown): value is FleetAction => Boolean(value && typeof value === 'object'
  && ['choose-variant-preset', 'choose-special-ships', 'place-ship', 'rotate-ship', 'complete-placement', 'queue-variant-shot', 'scout-variant-cell', 'reset-variant-plan', 'submit-variant-plan', 'shoot'].includes(String((value as { type?: unknown }).type)));

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
        tagOffset: Math.floor(Math.min(Math.max(random(), 0), 0.9999999999999999) * VARIANT_SPECIAL_SHIPS.length),
      },
    })),
    setupParticipantId: participants[0]!.id, placementParticipantId: null, turnParticipantId: null,
    shots: [], phase: 'setup', winnerId: null, draw: false, round: 1, roundPlans: [], presentationQueue: [], privateScouts: [], revealedFleetIds: [],
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

function blueprintCells(blueprint: FleetShipBlueprint, origin: FleetCell, orientation: FleetOrientation): readonly FleetCell[] {
  const rows = orientation === 'horizontal' ? blueprint.shape.rows : blueprint.shape.columns;
  const columns = orientation === 'horizontal' ? blueprint.shape.columns : blueprint.shape.rows;
  return Array.from({ length: rows * columns }, (_, index) => ({ row: origin.row + Math.floor(index / columns), column: origin.column + index % columns }));
}

function placeShip(state: FleetState, actorId: string, action: Extract<FleetAction, { type: 'place-ship' }>): FleetState {
  if (state.phase !== 'placement' || state.placementParticipantId !== actorId) return state;
  const participantIndex = state.participants.findIndex(({ id }) => id === actorId);
  const participant = state.participants[participantIndex];
  const blueprint = state.mode === 'variant' ? participant?.variantSetup?.fleet?.[action.shipIndex] : undefined;
  const expectedLength = blueprint ? blueprint.shape.rows * blueprint.shape.columns : state.baseFleetLengths[action.shipIndex];
  if (expectedLength === undefined) return state;
  const cells = blueprint ? blueprintCells(blueprint, action.origin, action.orientation) : fleetShipCells(expectedLength, action.origin, action.orientation);
  if (!cells.every((cell) => validCell(cell, state.boardSize))) return state;
  if (!participant || participant.placementComplete) return state;
  if (blueprint?.placementTag && !isFleetTaggedPlacementValid(blueprint, blueprint.placementTag, state.boardSize as 10 | 12, action.origin, action.orientation)) return state;
  const occupied = new Set(participant.ships.filter(({ index }) => index !== action.shipIndex).flatMap(({ cells: shipCells }) => shipCells.map(cellKey)));
  if (cells.some((cell) => occupied.has(cellKey(cell)))) return state;
  const ship: FleetShip = {
    index: action.shipIndex, length: expectedLength, orientation: action.orientation, cells,
    ...(blueprint ? { blueprintId: blueprint.id, special: blueprint.special, placementTag: blueprint.placementTag, damage: cells.map(() => 0), sunk: false } : {}),
  };
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
  const expectedCount = state.mode === 'variant' ? participant?.variantSetup?.fleet?.length : state.baseFleetLengths.length;
  if (!participant || participant.ships.length !== expectedCount) return state;
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

const helperShotTypeFor = (card: FleetShootingCard): FleetShotPlan['type'] => ({
  salvo: 'salvo', flare: 'flare', tracer: 'tracer', 'high-explosive': 'explosive', scatter: 'scatter',
  piercing: 'piercing', 'random-shot': 'random', buckshot: 'buckshot',
})[card] as FleetShotPlan['type'];

function variantShipStates(state: FleetState): FleetShipState[] {
  return state.participants.flatMap((participant) => participant.ships.map((ship) => {
    const blueprint = participant.variantSetup?.fleet?.[ship.index];
    return {
      id: blueprint?.id ?? `ship-${ship.index}`, shape: blueprint?.shape ?? { rows: 1, columns: ship.length },
      special: ship.special ?? null, ownerId: participant.id, damage: ship.damage ?? ship.cells.map(() => 0), sunk: ship.sunk ?? false,
    };
  }));
}

const variantAbilities = (state: FleetState, ownerId: string) => specialAbilitiesForOwner(ownerId, variantShipStates(state));
export const fleetVariantAbilitiesForOwner = variantAbilities;
const priorSalvoCounts = (state: FleetState, actorId: string) => {
  const turn = ((state.round ?? 1) - 1) % 3, cycleStart = (state.round ?? 1) - turn;
  return Array.from({ length: turn }, (_, offset) => state.shots.filter((shot) => shot.shooter === actorId && shot.shotType === 'salvo' && shot.round === cycleStart + offset).length);
};
const sameNumbers = (left: readonly number[], right: readonly number[]) => left.length === right.length && left.every((value, index) => value === right[index]);

function queueVariantShot(state: FleetState, actorId: string, action: Extract<FleetAction, { type: 'queue-variant-shot' }>): FleetState {
  if (state.mode !== 'variant' || state.phase !== 'targeting' || !action.plan || typeof action.plan !== 'object') return state;
  const actor = state.participants.find(({ id }) => id === actorId), target = state.participants.find(({ id }) => id === action.targetParticipantId);
  const shotType = actor?.variantSetup?.shootingCard;
  const current = state.roundPlans?.find(({ participantId }) => participantId === actorId);
  if (!actor?.alive || !target?.alive || target.id === actorId || !shotType || current?.submitted) return state;
  const uses = current?.uses ?? [], abilities = variantAbilities(state, actorId), baseType = helperShotTypeFor(shotType), roundIndex = (state.round ?? 1) - 1, baseUsed = uses.some(({ kind }) => kind === 'card');
  let use: FleetVariantUseKind | null = null;
  if (action.plan.type === baseType && (baseType === 'salvo' ? !uses.some(({ kind }) => kind !== 'card') : !baseUsed)) use = 'card';
  else if (baseUsed && action.plan.type === 'normal' && abilities.carrierExtraShots && !uses.some(({ kind }) => kind === 'carrier')) use = 'carrier';
  else if (baseUsed && action.plan.type === 'tracer' && abilities.tracerShots && !uses.some(({ kind }) => kind === 'tracer')) use = 'tracer';
  else if (baseUsed && action.plan.type === 'explosive' && abilities.glassCannonPressure && roundIndex % 2 === 1 && !uses.some(({ kind }) => kind === 'pressure')) use = 'pressure';
  if (!use) return state;
  if ('boardSize' in action.plan && action.plan.boardSize !== state.boardSize) return state;
  if ('turnIndex' in action.plan && action.plan.turnIndex !== roundIndex) return state;
  if (action.plan.type === 'salvo') {
    if (!Array.isArray(action.plan.cells) || !Array.isArray(action.plan.previousTurnShotCounts)) return state;
    const salvo = action.plan, history = priorSalvoCounts(state, actorId), cardCount = (current?.impacts.length ?? 0) + salvo.cells.length;
    if (salvo.turnInCycle !== roundIndex % 3 || !sameNumbers(salvo.previousTurnShotCounts, history) || cardCount > 3) return state;
    try { planFleetShots({ ...salvo, cells: Array.from({ length: cardCount }, () => salvo.cells[0]!) }); } catch { return state; }
  }
  if (action.plan.type === 'random') {
    if (!Array.isArray(action.plan.alreadyHitCells)) return state;
    const random = action.plan;
    const hits = state.shots.filter((shot) => shot.target === target.id && shot.result !== 'miss' && shot.impactKind !== 'flare').map(({ cell }) => cell);
    if (new Set(random.alreadyHitCells.map(cellKey)).size !== new Set(hits.map(cellKey)).size || hits.some((cell) => !random.alreadyHitCells.some((candidate) => sameCell(cell, candidate)))) return state;
  }
  let planned;
  try { planned = planFleetShots(action.plan); } catch { return state; }
  const rangePlan = action.plan.type === 'explosive' || action.plan.type === 'scatter' || (action.plan.type === 'buckshot' && action.plan.choice === 'buckshot');
  if (!rangePlan && planned.some(({ cell }) => !validCell(cell, state.boardSize))) return state;
  const recordedType: FleetShotType = use === 'carrier' ? 'bonus-normal' : use === 'tracer' ? 'tracer' : use === 'pressure' ? 'high-explosive' : shotType;
  const impacts = planned.filter(({ cell }) => validCell(cell, state.boardSize)).map(({ cell, kind }) => ({ targetParticipantId: target.id, cell, kind, shotType: recordedType }));
  if (impacts.length === 0 && !rangePlan) return state;
  const next: FleetRoundPlan = { participantId: actorId, impacts: [...(current?.impacts ?? []), ...impacts], submitted: false, uses: [...uses, { kind: use, targetParticipantId: target.id }] };
  return { ...state, roundPlans: [...(state.roundPlans ?? []).filter(({ participantId }) => participantId !== actorId), next] };
}

function scoutVariantCell(state: FleetState, actorId: string, action: Extract<FleetAction, { type: 'scout-variant-cell' }>): FleetState {
  if (state.mode !== 'variant' || state.phase !== 'targeting' || !validCell(action.cell, state.boardSize)) return state;
  const actor = state.participants.find(({ id }) => id === actorId), target = state.participants.find(({ id }) => id === action.targetParticipantId), current = state.roundPlans?.find(({ participantId }) => participantId === actorId);
  if (!actor?.alive || !target?.alive || target.id === actorId || current?.submitted || !variantAbilities(state, actorId).privateScouts || current?.uses?.some(({ kind }) => kind === 'spy')
    || state.privateScouts?.some(({ ownerId, round }) => ownerId === actorId && round === (state.round ?? 1))) return state;
  const scout = { ownerId: actorId, targetId: target.id, cell: { ...action.cell }, occupied: target.ships.some(({ cells }) => cells.some((cell) => sameCell(cell, action.cell))), round: state.round ?? 1 };
  const next: FleetRoundPlan = { participantId: actorId, impacts: current?.impacts ?? [], submitted: false, uses: [...(current?.uses ?? []), { kind: 'spy', targetParticipantId: target.id }] };
  return { ...state, privateScouts: [...(state.privateScouts ?? []), scout], roundPlans: [...(state.roundPlans ?? []).filter(({ participantId }) => participantId !== actorId), next] };
}

function resetVariantPlan(state: FleetState, actorId: string): FleetState {
  const plan = state.roundPlans?.find(({ participantId }) => participantId === actorId);
  if (state.mode !== 'variant' || state.phase !== 'targeting' || plan?.submitted) return state;
  return { ...state, roundPlans: (state.roundPlans ?? []).filter(({ participantId }) => participantId !== actorId) };
}

function resolveVariantRound(state: FleetState, plans: readonly FleetRoundPlan[]): FleetState {
  let participants = state.participants.map((participant) => ({ ...participant, ships: participant.ships.map((ship) => ({ ...ship, damage: ship.damage ? [...ship.damage] : undefined })) }));
  const preResolution = new Map(state.participants.map((participant) => [participant.id, participant]));
  const shots: FleetShot[] = [...state.shots], presentationQueue: FleetPresentation[] = [], revealedFleetIds = new Set(state.revealedFleetIds ?? []);
  for (const attacker of state.participants) {
    const plan = plans.find(({ participantId }) => participantId === attacker.id);
    for (const impact of plan?.impacts ?? []) {
      const targetIndex = participants.findIndex(({ id }) => id === impact.targetParticipantId), target = participants[targetIndex]!;
      const originalTarget = preResolution.get(impact.targetParticipantId)!;
      const originalShip = originalTarget.ships.find(({ cells }) => cells.some((cell) => sameCell(cell, impact.cell)));
      let result: FleetShotResult = 'miss';
      if (originalShip) {
        const shipIndex = target.ships.findIndex(({ index }) => index === originalShip.index), currentShip = target.ships[shipIndex]!;
        const blueprint = target.variantSetup?.fleet?.[currentShip.index];
        if (blueprint) {
          const cellIndex = originalShip.cells.findIndex((cell) => sameCell(cell, impact.cell));
          const initial = createFleetShipState(target.id, blueprint), applied = applyFleetImpact({ ...initial, damage: currentShip.damage ?? initial.damage, sunk: currentShip.sunk ?? false }, { kind: impact.kind === 'flare' ? 'flare' : 'damage', cellIndex });
          const targetShips = [...target.ships];
          targetShips[shipIndex] = { ...currentShip, damage: [...applied.ship.damage], sunk: applied.ship.sunk };
          participants[targetIndex] = { ...target, ships: targetShips };
          if (applied.revealOwnerFleet) revealedFleetIds.add(target.id);
          result = applied.publicResult === 'partial' ? 'partial' : applied.publicResult === 'sunk' ? 'sunk'
            : applied.publicResult === 'hit' || applied.publicResult === 'revealed' || (applied.publicResult === null && blueprint.special !== 'submarine') ? 'hit' : 'miss';
        }
      }
      shots.push({ shooter: attacker.id, target: impact.targetParticipantId, cell: { ...impact.cell }, shotType: impact.shotType, result, round: state.round ?? 1, impactKind: impact.kind });
      presentationQueue.push({ kind: 'caption', text: `${attacker.name} → ${target.name} 공격!`, attackerId: attacker.id, targetId: target.id });
      presentationQueue.push({ kind: 'result', text: result === 'miss' ? 'MISS!' : 'HIT!', attackerId: attacker.id, targetId: target.id });
    }
  }
  participants = participants.map((participant) => ({ ...participant, alive: participant.ships.some(({ sunk }) => !sunk) }));
  const survivors = participants.filter(({ alive }) => alive), complete = survivors.length <= 1;
  return {
    ...state, participants, shots, presentationQueue, revealedFleetIds: [...revealedFleetIds], roundPlans: [], round: (state.round ?? 1) + 1,
    phase: complete ? 'complete' : 'targeting', winnerId: survivors.length === 1 ? survivors[0]!.id : null,
    draw: survivors.length === 0, turnParticipantId: complete ? null : survivors[0]!.id,
  };
}

function submitVariantPlan(state: FleetState, actorId: string): FleetState {
  if (state.mode !== 'variant' || state.phase !== 'targeting') return state;
  const actor = state.participants.find(({ id }) => id === actorId), current = state.roundPlans?.find(({ participantId }) => participantId === actorId);
  if (!actor?.alive || !current || current.submitted || !current.uses?.some(({ kind }) => kind === 'card')) return state;
  const plans = (state.roundPlans ?? []).map((plan) => plan.participantId === actorId ? { ...plan, submitted: true } : plan);
  const living = state.participants.filter(({ alive }) => alive);
  if (living.every(({ id }) => plans.some((plan) => plan.participantId === id && plan.submitted))) return resolveVariantRound(state, plans);
  const next = living.find(({ id }) => !plans.some((plan) => plan.participantId === id && plan.submitted));
  return { ...state, roundPlans: plans, turnParticipantId: next?.id ?? null };
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

const specialKindFor = (kind: FleetSpecialShipType): FleetSpecialKind => ({
  'extra-armor': 'armor', submarine: 'submarine', 'aircraft-carrier': 'carrier', 'glass-cannon': 'glass-cannon',
  'spy-ship': 'spy', 'supply-ship': 'supply', 'paper-ship': 'paper',
})[kind] as FleetSpecialKind;

function taggedFleet(selected: readonly FleetSpecialShipType[], boardSize: 10 | 12, offset: number): readonly FleetTaggedShip[] {
  const fleet = buildVariantFleet(selected.map(specialKindFor));
  const candidates = fleet.map((_, index) => fleet[(index + offset) % fleet.length]!);
  const coastal = candidates.find((ship) => isFleetTaggedPlacementValid(ship, 'coastal', boardSize, { row: 0, column: 0 }, 'horizontal'))!;
  const ocean = candidates.find((ship) => ship.id !== coastal.id && isFleetTaggedPlacementValid(ship, 'ocean', boardSize, { row: boardSize === 10 ? 2 : 3, column: boardSize === 10 ? 2 : 3 }, 'horizontal'))!;
  const assigned = assignFleetPlacementTags(fleet, { coastalShipId: coastal.id, oceanShipId: ocean.id }, boardSize);
  if (!assigned.ok) throw new Error(`variant fleet tags failed: ${assigned.reason}`);
  return assigned.ships;
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
    variantSetup: { ...setup, selectedSpecialShips: [...selected], complete: true, fleet: taggedFleet(selected, state.boardSize as 10 | 12, setup.tagOffset) },
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
  if (action.type === 'queue-variant-shot') return queueVariantShot(state, actorId, action);
  if (action.type === 'scout-variant-cell') return scoutVariantCell(state, actorId, action);
  if (action.type === 'reset-variant-plan') return resetVariantPlan(state, actorId);
  if (action.type === 'submit-variant-plan') return submitVariantPlan(state, actorId);
  return shoot(state, actorId, action);
}

export const fleetActorId = (state: FleetState): string | null => state.phase === 'setup'
  ? state.setupParticipantId
  : state.phase === 'placement' ? state.placementParticipantId
    : state.mode === 'variant' && state.phase === 'targeting'
      ? state.participants.find(({ alive, id }) => alive && !(state.roundPlans ?? []).some((plan) => plan.participantId === id && plan.submitted))?.id ?? null
      : state.turnParticipantId;

export function projectFleetState(state: FleetState, viewerParticipantId?: string): FleetView {
  const viewer = state.participants.find(({ id }) => id === viewerParticipantId), showEveryFleet = state.mode === 'variant' && viewer?.alive === false;
  return {
    ...state,
    participants: state.participants.map((participant) => {
      const common = { id: participant.id, name: participant.name, placementComplete: participant.placementComplete, alive: participant.alive };
      return participant.id === viewerParticipantId || showEveryFleet || state.revealedFleetIds?.includes(participant.id) ? {
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
    privateScouts: state.privateScouts?.filter(({ ownerId }) => ownerId === viewerParticipantId).map((scout) => ({ ...scout, cell: { ...scout.cell } })),
  };
}
import { planFleetShots, type FleetImpactKind, type FleetShotPlan } from './fleet-shots';
import {
  applyFleetImpact, assignFleetPlacementTags, buildVariantFleet, createFleetShipState, isFleetTaggedPlacementValid, specialAbilitiesForOwner,
  type FleetPlacementTag, type FleetShipBlueprint, type FleetShipState, type FleetSpecialKind, type FleetTaggedShip,
} from './fleet-special';
