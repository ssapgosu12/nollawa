export interface GameContract<State, Action, Seat, View> {
  init(): State;
  reduce(state: State, action: Action): State;
  seatsToAct(state: State): readonly Seat[];
  terminal(state: State): { ended: boolean; winner: Seat | null; draw: boolean };
  redact(state: State, seat: Seat | null): View;
}

export type GridMove = { row: number; column: number };
export type GameMove = number | GridMove | { kind: 'swap' };
export type GameMoveKey = string;
export interface TeamVoteState {
  turn: 1 | 2;
  voters: Array<{ id: string; team: 1 | 2; move: GameMoveKey }>;
  deadline: number;
  effectsSuppressed: boolean;
}
export interface ResolvedTeamVote {
  turn: 1 | 2;
  selected: GameMoveKey;
  presentation: GameMoveKey[];
  settledAt: number;
}
export interface SharedGameState {
  vote?: TeamVoteState;
  resolvedVote?: ResolvedTeamVote;
  rematchConsent?: string[];
}
