import { reduceAuthorityYachtSession, createYachtSession, resolveYachtOpeningOrder, type YachtOpeningRollRound, type YachtParticipant, type YachtSessionState } from './yacht-session';
import type { YachtDie, YachtTurnAction } from './yacht';
export type YachtInputEvent =
  | { type: 'start'; participants: readonly YachtParticipant[]; turnOrder?: readonly string[] }
  | { type: 'input'; actorId: string; action: YachtTurnAction; legacyGroup?: number };
export interface YachtPersisted { kind: 'yacht'; semantics?: 'reroll-v2'; events: readonly YachtInputEvent[] }
export interface YachtDiceOpening { rounds: readonly YachtOpeningRollRound[]; order: readonly YachtParticipant[]; replayKey: number }
export const YACHT_STORAGE_KEY = 'nollawa-yacht-events-v1';
const cloneEvents = (events: readonly YachtInputEvent[]): YachtInputEvent[] => events.map((event) => event.type === 'start'
  ? { ...event, participants: event.participants.map((participant) => ({ ...participant })), ...('turnOrder' in event && event.turnOrder ? { turnOrder: [...event.turnOrder] } : {}) }
  : { ...event, action: { ...event.action, ...('dice' in event.action && Array.isArray(event.action.dice) ? { dice: [...event.action.dice] } : {}) } });
export function createYachtEventLog(participants: readonly YachtParticipant[], turnOrder: readonly string[] = participants.map(({ id }) => id)): YachtInputEvent[] {
  createYachtSession(participants, turnOrder);
  return [{ type: 'start', participants: participants.map((participant) => ({ ...participant })), turnOrder: [...turnOrder] }];
}
export function replayYachtEvents(events: readonly YachtInputEvent[]): YachtSessionState {
  const start = events[0];
  if (!start || start.type !== 'start' || events.slice(1).some((event) => event.type === 'start')) throw new RangeError('Yacht event log requires one leading start event');
  let state = createYachtSession(start.participants, start.turnOrder);
  for (const event of events.slice(1)) { if (event.type !== 'input') throw new RangeError('Invalid Yacht input event'); const next = reduceAuthorityYachtSession(state, event.actorId, event.action); if (next === state) throw new RangeError('Yacht log contains a rejected input'); state = next; }
  return state;
}
export function appendYachtInput(events: readonly YachtInputEvent[], actorId: string, action: YachtTurnAction): YachtInputEvent[] {
  const state = replayYachtEvents(events), next = reduceAuthorityYachtSession(state, actorId, action);
  return next === state ? events as YachtInputEvent[] : [...cloneEvents(events), { type: 'input', actorId, action: { ...action } }];
}
export const undoYachtInput = (events: readonly YachtInputEvent[]): YachtInputEvent[] => {
  if (events.length <= 1) return cloneEvents(events);
  const last = events.at(-1);
  if (last?.type !== 'input' || last.legacyGroup === undefined) return cloneEvents(events.slice(0, -1));
  return cloneEvents(events.filter((event) => event.type !== 'input' || event.legacyGroup !== last.legacyGroup));
};
export const yachtPersisted = (events: readonly YachtInputEvent[]): YachtPersisted => ({ kind: 'yacht', semantics: 'reroll-v2', events: cloneEvents(events) });
export const isYachtPersisted = (value: unknown): value is YachtPersisted => Boolean(value && typeof value === 'object'
  && (value as YachtPersisted).kind === 'yacht'
  && ((value as YachtPersisted).semantics === undefined || (value as YachtPersisted).semantics === 'reroll-v2')
  && Array.isArray((value as YachtPersisted).events));
export function saveYachtEvents(storage: Pick<Storage, 'setItem'> | undefined, events: readonly YachtInputEvent[]): void {
  try { storage?.setItem(YACHT_STORAGE_KEY, JSON.stringify(yachtPersisted(events))); } catch { /* storage failure must not stop play */ }
}
function actionType(event: unknown): unknown {
  if (!event || typeof event !== 'object' || (event as { type?: unknown }).type !== 'input') return undefined;
  const action = (event as { action?: unknown }).action;
  return action && typeof action === 'object' ? (action as { type?: unknown }).type : undefined;
}
function migrateLegacyYachtEvents(events: readonly unknown[]): YachtInputEvent[] {
  const start = events[0];
  if (!start || typeof start !== 'object' || (start as { type?: unknown }).type !== 'start') throw new RangeError('Legacy Yacht log requires a leading start event');
  const migrated = cloneEvents([start as YachtInputEvent]);
  let state = replayYachtEvents(migrated);
  let held = [false, false, false, false, false];
  const append = (actorId: string, action: YachtTurnAction, legacyGroup: number) => {
    const next = reduceAuthorityYachtSession(state, actorId, action);
    if (next === state) throw new RangeError('Legacy Yacht log contains a rejected input');
    migrated.push({ type: 'input', actorId, action: { ...action, ...('dice' in action && Array.isArray(action.dice) ? { dice: [...action.dice] } : {}) }, legacyGroup });
    state = next;
  };
  events.slice(1).forEach((event, offset) => {
    if (!event || typeof event !== 'object' || (event as { type?: unknown }).type !== 'input') throw new RangeError('Invalid legacy Yacht input event');
    const actorId = (event as { actorId?: unknown }).actorId;
    const action = (event as { action?: unknown }).action;
    if (typeof actorId !== 'string' || !action || typeof action !== 'object') throw new RangeError('Invalid legacy Yacht input event');
    const legacyAction = action as Record<string, unknown>, group = offset + 1;
    if (legacyAction.type === 'toggle-reroll') throw new RangeError('Mixed Yacht selection semantics');
    if (legacyAction.type === 'toggle-hold') {
      const index = legacyAction.index;
      if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= 5) throw new RangeError('Invalid legacy Yacht hold index');
      append(actorId, { type: 'toggle-reroll', index: index as number }, group);
      held[index as number] = !held[index as number];
      return;
    }
    if (!['roll', 'stop', 'register'].includes(String(legacyAction.type))) throw new RangeError('Invalid legacy Yacht action');
    append(actorId, legacyAction as unknown as YachtTurnAction, group);
    if (legacyAction.type === 'roll') {
      const current = state.participants.find((participant) => participant.id === state.currentParticipantId)?.turn;
      if (current?.phase === 'rolling') held.forEach((isHeld, index) => { if (!isHeld) append(actorId, { type: 'toggle-reroll', index }, group); });
    } else if (legacyAction.type === 'register') held = [false, false, false, false, false];
  });
  replayYachtEvents(migrated);
  return migrated;
}
export function loadYachtEvents(storage: Pick<Storage, 'getItem'> | undefined): YachtInputEvent[] | null {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(YACHT_STORAGE_KEY) ?? 'null');
    if (!isYachtPersisted(parsed)) return null;
    const currentSemantics = parsed.semantics === 'reroll-v2' || parsed.events.some((event) => actionType(event) === 'toggle-reroll');
    const events = currentSemantics ? cloneEvents(parsed.events) : migrateLegacyYachtEvents(parsed.events);
    replayYachtEvents(events);
    return events;
  } catch { return null; }
}
export function createYachtDiceOpening(participants: readonly YachtParticipant[], random: () => number = Math.random, replayKey = Date.now()): YachtDiceOpening {
  let groups: YachtParticipant[][] = [[...participants]], rounds: YachtOpeningRollRound[] = [];
  while (groups.some((group) => group.length > 1)) {
    const unresolved = groups.filter((group) => group.length > 1).flat(), round: Record<string, YachtDie> = {};
    for (const participant of unresolved) round[participant.id] = (Math.floor(random() * 6) + 1) as YachtDie;
    rounds.push(round);
    groups = groups.flatMap((group) => group.length === 1 ? [group] : [...new Map(group.map((participant) => [round[participant.id]!, [] as YachtParticipant[]])).keys()].sort((a, b) => b - a).map((die) => group.filter((participant) => round[participant.id] === die)));
  }
  return { rounds, order: resolveYachtOpeningOrder(participants, { method: 'participant-dice', rounds }), replayKey };
}
