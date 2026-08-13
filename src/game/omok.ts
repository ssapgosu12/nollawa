import type { GameContract } from './contract';
import { copyGrid, emptyGrid, hasLine, otherSeat, type GridCell, type GridSeat } from './line-grid';
export type OmokAction = { type: 'place'; row: number; column: number } | { type: 'swap' } | { type: 'restart' };
export interface OmokState { board: GridCell[][]; turn: GridSeat; winner: GridSeat | null; draw: boolean; moves: number; swapAvailable: boolean; starter: GridSeat }
const SIZE = 15;
const fresh = (starter: GridSeat): OmokState => ({ board: emptyGrid(SIZE), turn: starter, winner: null, draw: false, moves: 0, swapAvailable: false, starter });
function reduce(state: OmokState, action: OmokAction): OmokState {
  if (action.type === 'restart') return state.winner || state.draw ? fresh(otherSeat(state.starter)) : state;
  if (state.winner || state.draw) return state;
  if (action.type === 'swap') {
    if (!state.swapAvailable || state.moves !== 1) return state;
    const board = state.board.map((line) => line.map((cell) => cell === state.starter ? state.turn : cell));
    return { ...state, board, turn: otherSeat(state.turn), swapAvailable: false, starter: state.turn };
  }
  const { row, column } = action;
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= SIZE || column < 0 || column >= SIZE || state.board[row]?.[column] !== 0) return state;
  const board = copyGrid(state.board); board[row]![column] = state.turn;
  const moves = state.moves + 1;
  const winner = hasLine(board, row, column, state.turn, 5) ? state.turn : null;
  return { ...state, board, moves, winner, draw: !winner && moves === SIZE * SIZE, turn: otherSeat(state.turn), swapAvailable: moves === 1 };
}
const terminal = (state: OmokState) => ({ ended: state.winner !== null || state.draw, winner: state.winner, draw: state.draw });
export const omok: GameContract<OmokState, OmokAction, GridSeat, OmokState> = {
  init: () => fresh(1), reduce,
  seatsToAct: (state) => terminal(state).ended ? [] : [state.turn], terminal,
  redact: (state) => ({ ...state, board: copyGrid(state.board) }),
};
