import {
  YACHT_CATEGORIES,
  createYachtTurn,
  isYachtDice,
  reduceYachtTurn,
  scoreYachtCard,
  scoreYachtCategory,
  type YachtCategory,
  type YachtDie,
  type YachtScoreCard,
  type YachtScoreEntry,
  type YachtTurnAction,
  type YachtTurnState,
} from './yacht';

export interface YachtParticipant {
  id: string;
  name: string;
}

export interface YachtParticipantState extends YachtParticipant {
  turn: YachtTurnState;
}

export interface YachtSessionState {
  participants: readonly YachtParticipantState[];
  currentParticipantId: string;
  complete: boolean;
}

export interface YachtParticipantProjection extends YachtParticipant {
  dice: readonly YachtDie[] | null;
  held: readonly boolean[];
  rolls: number;
  phase: YachtTurnState['phase'];
  entries: readonly YachtScoreEntry[];
  scoreCard: YachtScoreCard;
  previews: Readonly<Partial<Record<YachtCategory, number>>>;
}

export interface YachtSessionProjection {
  participants: readonly YachtParticipantProjection[];
  currentParticipantId: string;
  complete: boolean;
}

export type YachtOpeningMethod = 'single' | 'common-coin' | 'participant-dice';
export type YachtOpeningRollRound = Readonly<Record<string, YachtDie>>;

export type YachtOpeningInput =
  | { method: 'single' }
  | { method: 'common-coin'; firstParticipantId: string }
  | { method: 'participant-dice'; rounds: readonly YachtOpeningRollRound[] };

function validateParticipants(participants: readonly YachtParticipant[]): void {
  if (participants.length < 1 || participants.length > 4) {
    throw new RangeError('Yacht requires 1-4 participants');
  }
  const ids = new Set<string>();
  for (const participant of participants) {
    if (typeof participant.id !== 'string' || participant.id.length === 0
      || typeof participant.name !== 'string' || participant.name.length === 0
      || ids.has(participant.id)) {
      throw new RangeError('Yacht participants require unique non-empty ids and names');
    }
    ids.add(participant.id);
  }
}

function cloneEntries(entries: readonly YachtScoreEntry[]): YachtScoreEntry[] {
  return entries.map((entry) => ({ ...entry, dice: [...entry.dice] }));
}

export function createYachtSession(participants: readonly YachtParticipant[]): YachtSessionState {
  validateParticipants(participants);
  return {
    participants: participants.map((participant) => ({ ...participant, turn: createYachtTurn() })),
    currentParticipantId: participants[0]!.id,
    complete: false,
  };
}

function nextParticipantIndex(state: YachtSessionState, currentIndex: number): number | null {
  for (let offset = 1; offset <= state.participants.length; offset += 1) {
    const candidate = (currentIndex + offset) % state.participants.length;
    if (state.participants[candidate]!.turn.entries.length < YACHT_CATEGORIES.length) return candidate;
  }
  return null;
}

export function reduceAuthorityYachtSession(
  state: YachtSessionState,
  actorParticipantId: string,
  action: YachtTurnAction,
): YachtSessionState {
  if (state.complete || actorParticipantId !== state.currentParticipantId) return state;
  const currentIndex = state.participants.findIndex(({ id }) => id === state.currentParticipantId);
  if (currentIndex < 0) return state;
  const current = state.participants[currentIndex]!;
  const turn = reduceYachtTurn(current.turn, action);
  if (turn === current.turn) return state;

  const participants = [...state.participants];
  participants[currentIndex] = { ...current, turn };
  if (turn.phase !== 'complete') return { ...state, participants };

  const nextIndex = nextParticipantIndex({ ...state, participants }, currentIndex);
  if (nextIndex === null) return { participants, currentParticipantId: current.id, complete: true };
  const next = participants[nextIndex]!;
  participants[nextIndex] = {
    ...next,
    turn: createYachtTurn(cloneEntries(next.turn.entries)),
  };
  return { participants, currentParticipantId: next.id, complete: false };
}

export const reduceYachtSession = reduceAuthorityYachtSession;

export function reduceLocalYachtSession(
  state: YachtSessionState,
  action: YachtTurnAction,
): YachtSessionState {
  return reduceAuthorityYachtSession(state, state.currentParticipantId, action);
}

function previewsFor(turn: YachtTurnState): Partial<Record<YachtCategory, number>> {
  const dice = turn.dice;
  if (dice === null || !isYachtDice(dice)) return {};
  const used = new Set(turn.entries.map(({ category }) => category));
  return Object.fromEntries(YACHT_CATEGORIES
    .filter((category) => !used.has(category))
    .map((category) => [category, scoreYachtCategory(category, dice)]));
}

export function projectYachtSession(
  state: YachtSessionState,
  _viewerParticipantId?: string,
): YachtSessionProjection {
  return {
    currentParticipantId: state.currentParticipantId,
    complete: state.complete,
    participants: state.participants.map(({ id, name, turn }) => ({
      id,
      name,
      dice: turn.dice === null ? null : [...turn.dice],
      held: [...turn.held],
      rolls: turn.rolls,
      phase: turn.phase,
      entries: cloneEntries(turn.entries),
      scoreCard: scoreYachtCard(turn.entries),
      previews: previewsFor(turn),
    })),
  };
}

export const publicYachtSession = projectYachtSession;

export function openingMethodForPlayerCount(playerCount: number): YachtOpeningMethod {
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 4) {
    throw new RangeError('Yacht opening order requires 1-4 participants');
  }
  if (playerCount === 1) return 'single';
  if (playerCount === 2) return 'common-coin';
  return 'participant-dice';
}

function assertRound(round: YachtOpeningRollRound | undefined, expectedIds: readonly string[]): void {
  if (round === undefined) throw new RangeError('More opening-order rolls are required');
  const actualIds = Object.keys(round).sort();
  const expected = [...expectedIds].sort();
  if (actualIds.length !== expected.length || actualIds.some((id, index) => id !== expected[index])) {
    throw new RangeError('Each opening round must roll exactly the unresolved participants');
  }
  if (!actualIds.every((id) => {
    const die = round[id];
    return die !== undefined && Number.isInteger(die) && die >= 1 && die <= 6;
  })) {
    throw new RangeError('Opening-order rolls must be d6 values');
  }
}

function partitionByRoll(
  group: readonly YachtParticipant[],
  round: YachtOpeningRollRound,
): YachtParticipant[][] {
  const buckets = new Map<YachtDie, YachtParticipant[]>();
  for (const participant of group) {
    const die = round[participant.id]!;
    const bucket = buckets.get(die) ?? [];
    bucket.push(participant);
    buckets.set(die, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, participants]) => participants);
}

function resolveParticipantDiceOrder(
  participants: readonly YachtParticipant[],
  rounds: readonly YachtOpeningRollRound[],
): YachtParticipant[] {
  let groups: YachtParticipant[][] = [[...participants]];
  let roundIndex = 0;
  while (groups.some((group) => group.length > 1)) {
    const unresolved = groups.filter((group) => group.length > 1).flat();
    const round = rounds[roundIndex];
    if (round === undefined) throw new RangeError('More opening-order rolls are required');
    assertRound(round, unresolved.map(({ id }) => id));
    groups = groups.flatMap((group) => group.length === 1 ? [group] : partitionByRoll(group, round));
    roundIndex += 1;
  }
  if (roundIndex !== rounds.length) throw new RangeError('Opening-order rounds include unnecessary rolls');
  return groups.flat();
}

export function resolveYachtOpeningOrder(
  participants: readonly YachtParticipant[],
  input: YachtOpeningInput,
): readonly YachtParticipant[] {
  validateParticipants(participants);
  const expectedMethod = openingMethodForPlayerCount(participants.length);
  if (input.method !== expectedMethod) throw new RangeError(`Expected ${expectedMethod} opening input`);
  if (input.method === 'single') return [...participants];
  if (input.method === 'common-coin') {
    const firstIndex = participants.findIndex(({ id }) => id === input.firstParticipantId);
    if (firstIndex < 0) throw new RangeError('Common coin result must name a participant');
    return [participants[firstIndex]!, participants[1 - firstIndex]!];
  }
  return resolveParticipantDiceOrder(participants, input.rounds);
}
