import { legalColumns, samok, type SamokState, type Seat } from './samok';

export interface VoteMember { id: string; team: Seat }
export interface VoteActor { id: string; seat: Seat | null }
export interface TeamVoteState {
  turn: Seat;
  voters: Array<{ id: string; team: Seat; column: number }>;
  deadline: number;
  effectsSuppressed: boolean;
}
export interface ResolvedTeamVote {
  turn: Seat;
  selected: number;
  presentation: number[];
  settledAt: number;
}
export interface RouletteStep { column: number; dwellMs: number }

function currentMembers(members: readonly VoteMember[], turn: Seat): VoteMember[] {
  const current = members.filter((member) => member.team === turn);
  return new Set(current.map((member) => member.id)).size === current.length ? current : [];
}

function validVoters(vote: TeamVoteState, members: readonly VoteMember[], legal: readonly number[]) {
  const memberIds = new Set(members.map((member) => member.id));
  const seen = new Set<string>();
  return vote.voters.filter((voter) => {
    if (seen.has(voter.id) || voter.team !== vote.turn || !memberIds.has(voter.id) || !legal.includes(voter.column)) return false;
    seen.add(voter.id);
    return true;
  });
}

function finalize(state: SamokState, vote: TeamVoteState, members: readonly VoteMember[], now: number, random: () => number): SamokState {
  const legal = legalColumns(state);
  const counts = new Map<number, number>();
  for (const voter of validVoters(vote, members, legal)) counts.set(voter.column, (counts.get(voter.column) ?? 0) + 1);
  const maximum = Math.max(0, ...counts.values());
  const tied = legal.filter((column) => counts.get(column) === maximum && maximum > 0);
  if (!tied.length) return { ...state, vote: undefined };
  const selected = tied.length === 1 ? tied[0]! : tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))]!;
  const presentation = tied.length === 1 ? [selected] : [selected, ...tied.filter((column) => column !== selected)].slice(0, 3);
  const resolvedVote = { turn: state.turn, selected, presentation, settledAt: now };
  if (tied.length > 1) return { ...state, vote: undefined, resolvedVote };
  const dropped = samok.reduce(state, { type: 'drop', column: selected });
  if (dropped === state) return { ...state, vote: undefined };
  return { ...dropped, vote: undefined, resolvedVote };
}

export function nextVoteDeadline(state: SamokState): number | null {
  if (!state.vote || state.vote.turn !== state.turn) return null;
  return state.vote.deadline;
}

export const authorityVoteDeadline = (state: SamokState, authority: boolean): number | null => authority ? nextVoteDeadline(state) : null;

export function resolvedVoteDeadline(state: SamokState): number | null {
  const plan = roulettePlan(state.resolvedVote);
  return state.resolvedVote && plan.length ? state.resolvedVote.settledAt + plan.reduce((total, step) => total + step.dwellMs, 0) : null;
}

export const authorityResolvedVoteDeadline = (state: SamokState, authority: boolean): number | null => authority ? resolvedVoteDeadline(state) : null;

export function commitResolvedTeamVote(state: SamokState, now: number): SamokState {
  const deadline = resolvedVoteDeadline(state);
  if (deadline === null || now < deadline || state.resolvedVote?.turn !== state.turn) return state;
  return samok.reduce(state, { type: 'drop', column: state.resolvedVote.selected });
}

export function settleTeamVote(state: SamokState, members: readonly VoteMember[], now: number, random: () => number): SamokState {
  const deadline = nextVoteDeadline(state);
  if (deadline === null || now < deadline || !state.vote) return state;
  return finalize(state, state.vote, currentMembers(members, state.turn), now, random);
}

export function castTeamVote(state: SamokState, column: number, actor: VoteActor, members: readonly VoteMember[], now: number, random: () => number): SamokState {
  const eligible = currentMembers(members, state.turn);
  const member = eligible.filter((candidate) => candidate.id === actor.id);
  if (member.length !== 1 || actor.seat !== state.turn || !Number.isInteger(column) || !legalColumns(state).includes(column)) return state;
  const expired = settleTeamVote(state, eligible, now, random);
  if (expired !== state) return expired;
  const previous = state.vote?.turn === state.turn ? state.vote : undefined;
  const previousVote = previous ? validVoters(previous, eligible, legalColumns(state)).find((voter) => voter.id === actor.id) : undefined;
  if (previousVote?.column === column) return state;
  const voters = previous ? validVoters(previous, eligible, legalColumns(state)).filter((voter) => voter.id !== actor.id) : [];
  voters.push({ id: actor.id, team: state.turn, column });
  const unvoted = eligible.length - voters.length;
  const vote: TeamVoteState = {
    turn: state.turn,
    voters,
    deadline: now + (unvoted === 0 ? 1_000 : (unvoted * 4 + 7) * 1_000),
    effectsSuppressed: unvoted === 0,
  };
  const next = { ...state, vote, resolvedVote: undefined };
  if (voters.length === eligible.length && new Set(voters.map((voter) => voter.column)).size === 1) return finalize(next, vote, eligible, now, random);
  return next;
}

export function reduceAuthorityVote(state: SamokState, column: number, actor: VoteActor, members: readonly VoteMember[], authority: boolean, now: number, random: () => number): SamokState {
  return authority ? castTeamVote(state, column, actor, members, now, random) : state;
}

export function voteDots(state: SamokState, selfId: string | null): Array<{ count: number; own: boolean }> {
  const seen = new Set<string>();
  const voters = state.vote?.voters.filter((voter) => {
    if (seen.has(voter.id)) return false;
    seen.add(voter.id);
    return true;
  }) ?? [];
  return Array.from({ length: 7 }, (_, column) => ({
    count: voters.filter((voter) => voter.column === column).length,
    own: voters.some((voter) => voter.id === selfId && voter.column === column),
  }));
}

export function roulettePlan(resolved: ResolvedTeamVote | undefined): RouletteStep[] {
  if (!resolved || resolved.presentation.length < 2) return [];
  const dwell = [100, 150, 200, 250, 300, 350, 400];
  return dwell.map((dwellMs, index) => ({ column: index === dwell.length - 1 ? resolved.selected : resolved.presentation[index % resolved.presentation.length]!, dwellMs }));
}
