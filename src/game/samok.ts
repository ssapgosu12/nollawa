import type { GameContract } from './contract';
import type { ResolvedTeamVote, TeamVoteState } from './team-vote';
export type Seat = 1 | 2;
export type Cell = 0 | Seat;
export type SamokAction = { type: 'drop' | 'vote'; column: number } | { type: 'restart' };
export interface SamokState {
  board: Cell[][];
  turn: Seat;
  winner: Seat | null;
  draw: boolean;
  moves: number;
  vote?: TeamVoteState;
  resolvedVote?: ResolvedTeamVote;
  rematchConsent?: string[];
}
const ROWS = 6;
const COLUMNS = 7;
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLUMNS).fill(0));
}
function inside(row: number, column: number): boolean {
  return row >= 0 && row < ROWS && column >= 0 && column < COLUMNS;
}
function hasFour(board: Cell[][], seat: Seat): boolean {
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      if (board[row]?.[column] !== seat) continue;
      for (const [dr, dc] of DIRECTIONS) {
        let count = 1;
        while (count < 4 && inside(row + dr * count, column + dc * count)
          && board[row + dr * count]?.[column + dc * count] === seat) count += 1;
        if (count === 4) return true;
      }
    }
  }
  return false;
}
export function legalColumns(state: SamokState): number[] {
  if (state.winner || state.draw) return [];
  return Array.from({ length: COLUMNS }, (_, column) => column)
    .filter((column) => state.board[ROWS - 1]?.[column] === 0);
}
function otherSeat(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}
function init(starter: Seat = 1): SamokState {
  return { board: emptyBoard(), turn: starter, winner: null, draw: false, moves: 0 };
}
function reduce(state: SamokState, action: SamokAction): SamokState {
  if (action.type === 'restart') {
    if (!state.winner && !state.draw) return state;
    const previousStarter = state.moves % 2 === 0 ? state.turn : otherSeat(state.turn);
    return init(otherSeat(previousStarter));
  }
  if (action.type === 'vote') return state;
  if (state.winner || state.draw
    || !Number.isInteger(action.column) || action.column < 0 || action.column >= COLUMNS) return state;
  const row = state.board.findIndex((cells) => cells[action.column] === 0);
  if (row < 0) return state;
  const board = state.board.map((cells) => [...cells]);
  const placed = board[row];
  if (!placed) return state;
  placed[action.column] = state.turn;
  const moves = state.moves + 1;
  const winner = hasFour(board, state.turn) ? state.turn : null;
  const draw = winner === null && moves === ROWS * COLUMNS;
  return { board, turn: otherSeat(state.turn), winner, draw, moves };
}
export function applyRemoteAction(state: SamokState, action: SamokAction, seat: Seat | null): SamokState {
  if (seat !== 1 && seat !== 2) return state;
  if (action.type === 'drop' && seat !== state.turn) return state;
  return reduce(state, action);
}
function seatsToAct(state: SamokState): readonly Seat[] {
  return state.winner || state.draw ? [] : [state.turn];
}
function terminal(state: SamokState) {
  return { ended: state.winner !== null || state.draw, winner: state.winner, draw: state.draw };
}
function redact(state: SamokState, _seat: Seat | null): SamokState {
  return { ...state, board: state.board.map((row) => [...row]) };
}
export const samok: GameContract<SamokState, SamokAction, Seat, SamokState> = {
  init,
  reduce,
  seatsToAct,
  terminal,
  redact,
};
