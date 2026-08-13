import { samok, type SamokState } from './samok';

export interface RematchMember { id: string; name: string }
export interface RematchState { rematchConsent?: string[] }

function uniqueMembers(members: readonly RematchMember[]): RematchMember[] {
  return [...new Map(members.map((member) => [member.id, member])).values()];
}

export function rematchProgress(state: RematchState, members: readonly RematchMember[], selfId: string | null) {
  const population = uniqueMembers(members);
  const consent = new Set(state.rematchConsent ?? []);
  const readyIds = population.filter((member) => consent.has(member.id)).map((member) => member.id);
  return {
    ready: readyIds.length,
    total: population.length,
    pendingNames: population.filter((member) => !consent.has(member.id)).map((member) => member.name),
    selfReady: selfId !== null && readyIds.includes(selfId),
  };
}

export function reduceRematchConsent(state: SamokState, actorId: string, members: readonly RematchMember[]): SamokState {
  return reduceSharedRematch(state, actorId, members, samok.terminal(state).ended, (current) => samok.reduce(current, { type: 'restart' }));
}

export function reduceSharedRematch<State extends RematchState>(state: State, actorId: string, members: readonly RematchMember[], ended: boolean, restart: (state: State) => State): State {
  if (!ended) return state;
  const population = uniqueMembers(members);
  if (!population.some((member) => member.id === actorId)) return state;
  const consent = new Set(state.rematchConsent ?? []);
  if (consent.has(actorId)) return state;
  consent.add(actorId);
  const rematchConsent = population.filter((member) => consent.has(member.id)).map((member) => member.id);
  const consentState = { ...state, rematchConsent };
  return rematchConsent.length === population.length ? restart(consentState) : consentState;
}
