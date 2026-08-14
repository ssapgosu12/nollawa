import type { GameMoveKey, ResolvedTeamVote, TeamVoteState } from './contract';
import { legalColumns, samok, type SamokState, type Seat } from './samok';
export type { ResolvedTeamVote, TeamVoteState } from './contract';

export interface VoteMember { id: string; team: Seat }
export interface VoteActor { id: string; seat: Seat | null }
export interface RouletteStep { move: GameMoveKey; dwellMs: number }
export interface VotableState { turn: Seat; vote?: TeamVoteState; resolvedVote?: ResolvedTeamVote }
export interface TeamVoteRules<State extends VotableState> {
  legalMoves(state: State): readonly GameMoveKey[];
  applyMove(state: State, move: GameMoveKey): State;
}

const samokRules: TeamVoteRules<SamokState> = {
  legalMoves: (state) => legalColumns(state).map(String),
  applyMove: (state, move) => samok.reduce(state, { type: 'drop', column: Number(move) }),
};
const rulesFor = <State extends VotableState>(rules?: TeamVoteRules<State>) => rules ?? samokRules as unknown as TeamVoteRules<State>;
const identity = (move: GameMoveKey | number): GameMoveKey => String(move);

function currentMembers(members: readonly VoteMember[], turn: Seat): VoteMember[] {
  const current = members.filter((member) => member.team === turn);
  return new Set(current.map((member) => member.id)).size === current.length ? current : [];
}

function validVoters(vote: TeamVoteState, members: readonly VoteMember[], legal: readonly GameMoveKey[]) {
  const memberIds = new Set(members.map((member) => member.id)), seen = new Set<string>();
  return vote.voters.filter((voter) => {
    if (seen.has(voter.id) || voter.team !== vote.turn || !memberIds.has(voter.id) || !legal.includes(voter.move)) return false;
    seen.add(voter.id); return true;
  });
}

function finalize<State extends VotableState>(state: State, vote: TeamVoteState, members: readonly VoteMember[], now: number, random: () => number, rules: TeamVoteRules<State>): State {
  const legal = rules.legalMoves(state), counts = new Map<GameMoveKey, number>();
  for (const voter of validVoters(vote, members, legal)) counts.set(voter.move, (counts.get(voter.move) ?? 0) + 1);
  const maximum = Math.max(0, ...counts.values()), tied = legal.filter((move) => counts.get(move) === maximum && maximum > 0);
  if (!tied.length) return { ...state, vote: undefined };
  const selected = tied.length === 1 ? tied[0]! : tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))]!;
  const presentation = tied.length === 1 ? [selected] : [selected, ...tied.filter((move) => move !== selected)].slice(0, 3);
  const resolvedVote = { turn: state.turn, selected, presentation, settledAt: now };
  if (tied.length > 1) return { ...state, vote: undefined, resolvedVote };
  const applied = rules.applyMove(state, selected);
  return applied === state ? { ...state, vote: undefined } : { ...applied, vote: undefined, resolvedVote: undefined };
}

export function nextVoteDeadline(state: VotableState): number | null { return state.vote?.turn === state.turn ? state.vote.deadline : null; }
export const authorityVoteDeadline = (state: VotableState, authority: boolean): number | null => authority ? nextVoteDeadline(state) : null;
export function resolvedVoteDeadline(state: VotableState): number | null { const plan = roulettePlan(state.resolvedVote); return state.resolvedVote && plan.length ? state.resolvedVote.settledAt + plan.reduce((total, step) => total + step.dwellMs, 0) : null; }
export const authorityResolvedVoteDeadline = (state: VotableState, authority: boolean): number | null => authority ? resolvedVoteDeadline(state) : null;

export function commitResolvedTeamVote<State extends VotableState>(state: State, now: number, rules?: TeamVoteRules<State>): State {
  const deadline = resolvedVoteDeadline(state);
  if (deadline === null || now < deadline || state.resolvedVote?.turn !== state.turn) return state;
  const applied = rulesFor(rules).applyMove(state, state.resolvedVote.selected);
  return applied === state ? state : { ...applied, vote: undefined, resolvedVote: undefined };
}

export function settleTeamVote<State extends VotableState>(state: State, members: readonly VoteMember[], now: number, random: () => number, rules?: TeamVoteRules<State>): State {
  const deadline = nextVoteDeadline(state);
  return deadline === null || now < deadline || !state.vote ? state : finalize(state, state.vote, currentMembers(members, state.turn), now, random, rulesFor(rules));
}

export function castTeamVote<State extends VotableState>(state: State, requested: GameMoveKey | number, actor: VoteActor, members: readonly VoteMember[], now: number, random: () => number, rules?: TeamVoteRules<State>): State {
  const selectedRules = rulesFor(rules), move = identity(requested), eligible = currentMembers(members, state.turn), member = eligible.filter((candidate) => candidate.id === actor.id), legal = selectedRules.legalMoves(state);
  if (member.length !== 1 || actor.seat !== state.turn || !legal.includes(move)) return state;
  const expired = settleTeamVote(state, eligible, now, random, selectedRules); if (expired !== state) return expired;
  const previous = state.vote?.turn === state.turn ? state.vote : undefined;
  const previousVote = previous ? validVoters(previous, eligible, legal).find((voter) => voter.id === actor.id) : undefined;
  if (previousVote?.move === move) return state;
  const voters = previous ? validVoters(previous, eligible, legal).filter((voter) => voter.id !== actor.id) : [];
  voters.push({ id: actor.id, team: state.turn, move });
  const unvoted = eligible.length - voters.length, vote: TeamVoteState = { turn: state.turn, voters, deadline: now + (unvoted === 0 ? 1_000 : (unvoted * 4 + 7) * 1_000), effectsSuppressed: unvoted === 0 };
  const next = { ...state, vote, resolvedVote: undefined };
  return voters.length === eligible.length && new Set(voters.map((voter) => voter.move)).size === 1 ? finalize(next, vote, eligible, now, random, selectedRules) : next;
}

export function reduceAuthorityVote<State extends VotableState>(state: State, move: GameMoveKey | number, actor: VoteActor, members: readonly VoteMember[], authority: boolean, now: number, random: () => number, rules?: TeamVoteRules<State>): State {
  return authority ? castTeamVote(state, move, actor, members, now, random, rules) : state;
}

export function voteMarks(state: VotableState, selfId: string | null): Map<GameMoveKey, { count: number; own: boolean }> {
  const seen = new Set<string>(), marks = new Map<GameMoveKey, { count: number; own: boolean }>();
  for (const voter of state.vote?.voters ?? []) { if (seen.has(voter.id)) continue; seen.add(voter.id); const mark = marks.get(voter.move) ?? { count: 0, own: false }; marks.set(voter.move, { count: mark.count + 1, own: mark.own || voter.id === selfId }); }
  return marks;
}
export function voteDots(state: VotableState, selfId: string | null): Array<{ count: number; own: boolean }> { const marks = voteMarks(state, selfId); return Array.from({ length: 7 }, (_, column) => marks.get(String(column)) ?? { count: 0, own: false }); }
export function roulettePlan(resolved: ResolvedTeamVote | undefined): RouletteStep[] { if (!resolved || resolved.presentation.length < 2) return []; const dwell = [100, 150, 200, 250, 300, 350, 400]; return dwell.map((dwellMs, index) => ({ move: index === dwell.length - 1 ? resolved.selected : resolved.presentation[index % resolved.presentation.length]!, dwellMs })); }
