import { reduceAuthorityYachtSession, createYachtSession, resolveYachtOpeningOrder, type YachtOpeningRollRound, type YachtParticipant, type YachtSessionState } from './yacht-session';
import type { YachtDie, YachtTurnAction } from './yacht';
export type YachtInputEvent =
  | { type: 'start'; participants: readonly YachtParticipant[] }
  | { type: 'input'; actorId: string; action: YachtTurnAction };
export interface YachtPersisted { kind: 'yacht'; events: readonly YachtInputEvent[] }
export interface YachtDiceOpening { rounds: readonly YachtOpeningRollRound[]; order: readonly YachtParticipant[]; replayKey: number }
export const YACHT_STORAGE_KEY = 'nollawa-yacht-events-v1';
const cloneEvents = (events: readonly YachtInputEvent[]): YachtInputEvent[] => events.map((event) => event.type === 'start'
  ? { ...event, participants: event.participants.map((participant) => ({ ...participant })) }
  : { ...event, action: { ...event.action, ...('dice' in event.action && Array.isArray(event.action.dice) ? { dice: [...event.action.dice] } : {}) } });
export function createYachtEventLog(participants: readonly YachtParticipant[]): YachtInputEvent[] {
  createYachtSession(participants);
  return [{ type: 'start', participants: participants.map((participant) => ({ ...participant })) }];
}
export function replayYachtEvents(events: readonly YachtInputEvent[]): YachtSessionState {
  const start = events[0];
  if (!start || start.type !== 'start' || events.slice(1).some((event) => event.type === 'start')) throw new RangeError('Yacht event log requires one leading start event');
  let state = createYachtSession(start.participants);
  for (const event of events.slice(1)) { if (event.type !== 'input') throw new RangeError('Invalid Yacht input event'); const next = reduceAuthorityYachtSession(state, event.actorId, event.action); if (next === state) throw new RangeError('Yacht log contains a rejected input'); state = next; }
  return state;
}
export function appendYachtInput(events: readonly YachtInputEvent[], actorId: string, action: YachtTurnAction): YachtInputEvent[] {
  const state = replayYachtEvents(events), next = reduceAuthorityYachtSession(state, actorId, action);
  return next === state ? events as YachtInputEvent[] : [...cloneEvents(events), { type: 'input', actorId, action: { ...action } }];
}
export const undoYachtInput = (events: readonly YachtInputEvent[]): YachtInputEvent[] => events.length > 1 ? cloneEvents(events.slice(0, -1)) : cloneEvents(events);
export const yachtPersisted = (events: readonly YachtInputEvent[]): YachtPersisted => ({ kind: 'yacht', events: cloneEvents(events) });
export const isYachtPersisted = (value: unknown): value is YachtPersisted => Boolean(value && typeof value === 'object' && (value as YachtPersisted).kind === 'yacht' && Array.isArray((value as YachtPersisted).events));
export function saveYachtEvents(storage: Pick<Storage, 'setItem'> | undefined, events: readonly YachtInputEvent[]): void {
  try { storage?.setItem(YACHT_STORAGE_KEY, JSON.stringify(yachtPersisted(events))); } catch { /* storage failure must not stop play */ }
}
export function loadYachtEvents(storage: Pick<Storage, 'getItem'> | undefined): YachtInputEvent[] | null {
  try { const parsed: unknown = JSON.parse(storage?.getItem(YACHT_STORAGE_KEY) ?? 'null'); if (!isYachtPersisted(parsed)) return null; replayYachtEvents(parsed.events); return cloneEvents(parsed.events); } catch { return null; }
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
