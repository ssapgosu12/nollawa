import type { GameContract } from './contract';
import { copyGrid, emptyGrid, hasLine, otherSeat, type GridCell, type GridSeat } from './line-grid';
export type YukmokAction = { type: 'place'; row: number; column: number } | { type: 'restart' };
export interface YukmokState { board: GridCell[][]; turn: GridSeat; winner: GridSeat | null; draw: boolean; moves: number; stonesLeft: 1 | 2; starter: GridSeat }
const SIZE = 19;
const fresh = (starter: GridSeat): YukmokState => ({ board: emptyGrid(SIZE), turn: starter, winner: null, draw: false, moves: 0, stonesLeft: 1, starter });
function reduce(state: YukmokState, action: YukmokAction): YukmokState {
  if (action.type === 'restart') return state.winner || state.draw ? fresh(otherSeat(state.starter)) : state;
  if (state.winner || state.draw) return state;
  const { row, column } = action;
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= SIZE || column < 0 || column >= SIZE || state.board[row]?.[column] !== 0) return state;
  const board = copyGrid(state.board); board[row]![column] = state.turn;
  const moves = state.moves + 1;
  const winner = hasLine(board, row, column, state.turn, 6) ? state.turn : null;
  const draw = !winner && moves === SIZE * SIZE;
  const endTurn = state.stonesLeft === 1;
  return { ...state, board, moves, winner, draw, turn: endTurn ? otherSeat(state.turn) : state.turn, stonesLeft: endTurn ? 2 : 1 };
}
const terminal = (state: YukmokState) => ({ ended: state.winner !== null || state.draw, winner: state.winner, draw: state.draw });
export const yukmok: GameContract<YukmokState, YukmokAction, GridSeat, YukmokState> = {
  init: () => fresh(1), reduce,
  seatsToAct: (state) => terminal(state).ended ? [] : [state.turn], terminal,
  redact: (state) => ({ ...state, board: copyGrid(state.board) }),
};
