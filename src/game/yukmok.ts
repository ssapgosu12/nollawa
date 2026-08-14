import type { GameContract, SharedGameState } from './contract';
import { copyGrid, emptyGrid, hasLine, otherSeat, type GridCell, type GridSeat } from './line-grid';
import type { BoardSize } from './omok';
export type YukmokAction = { type: 'place'; row: number; column: number } | { type: 'restart' };
export interface YukmokState extends SharedGameState { board: GridCell[][]; turn: GridSeat; winner: GridSeat | null; draw: boolean; moves: number; stonesLeft: 1 | 2; starter: GridSeat }
const fresh = (starter: GridSeat, size: BoardSize = 13): YukmokState => ({ board: emptyGrid(size), turn: starter, winner: null, draw: false, moves: 0, stonesLeft: 1, starter });
function reduce(state: YukmokState, action: YukmokAction): YukmokState {
  if (action.type === 'restart') return state.winner || state.draw ? fresh(otherSeat(state.starter), state.board.length as BoardSize) : state;
  if (state.winner || state.draw) return state;
  const { row, column } = action;
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= state.board.length || column < 0 || column >= state.board.length || state.board[row]?.[column] !== 0) return state;
  const board = copyGrid(state.board); board[row]![column] = state.turn;
  const moves = state.moves + 1;
  const winner = hasLine(board, row, column, state.turn, 6) ? state.turn : null;
  const draw = !winner && moves === board.length * board.length;
  const endTurn = state.stonesLeft === 1;
  return { ...state, board, moves, winner, draw, turn: endTurn ? otherSeat(state.turn) : state.turn, stonesLeft: endTurn ? 2 : 1 };
}
const terminal = (state: YukmokState) => ({ ended: state.winner !== null || state.draw, winner: state.winner, draw: state.draw });
export const yukmok = {
  init: (size: BoardSize = 13) => fresh(1, size), reduce,
  seatsToAct: (state: YukmokState) => terminal(state).ended ? [] : [state.turn], terminal,
  redact: (state: YukmokState, _seat: GridSeat | null) => ({ ...state, board: copyGrid(state.board) }),
} satisfies GameContract<YukmokState, YukmokAction, GridSeat, YukmokState>;
