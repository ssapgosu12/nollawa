import type { GameContract, SharedGameState } from './contract';
import { copyGrid, emptyGrid, otherSeat, type GridCell, type GridSeat } from './line-grid';
export type ReversiAction = { type: 'move'; row: number; column: number } | { type: 'restart' };
export interface ReversiState extends SharedGameState { board: GridCell[][]; turn: GridSeat; winner: GridSeat | null; draw: boolean; moves: number; starter: GridSeat }
export interface ReversiMove { row: number; column: number }
const SIZE = 8;
const DIRECTIONS = [-1, 0, 1].flatMap((dr) => [-1, 0, 1].map((dc) => [dr, dc] as const)).filter(([dr, dc]) => dr || dc);
function captures(board: readonly (readonly GridCell[])[], row: number, column: number, seat: GridSeat): ReversiMove[] {
  if (board[row]?.[column] !== 0) return [];
  const found: ReversiMove[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    const line: ReversiMove[] = [];
    for (let step = 1; ; step += 1) {
      const next = board[row + dr * step]?.[column + dc * step];
      if (next === otherSeat(seat)) line.push({ row: row + dr * step, column: column + dc * step });
      else { if (next === seat && line.length) found.push(...line); break; }
    }
  }
  return found;
}
export function legalReversiMoves(state: ReversiState, seat: GridSeat = state.turn): ReversiMove[] {
  if (state.winner || state.draw) return [];
  return Array.from({ length: SIZE * SIZE }, (_, index) => ({ row: Math.floor(index / SIZE), column: index % SIZE })).filter(({ row, column }) => captures(state.board, row, column, seat).length > 0);
}
const score = (board: readonly (readonly GridCell[])[]) => board.flat().reduce<[number, number]>((sum, cell) => { if (cell === 1) sum[0] += 1; else if (cell === 2) sum[1] += 1; return sum; }, [0, 0]);
function fresh(starter: GridSeat): ReversiState {
  const board = emptyGrid(SIZE), second = otherSeat(starter);
  board[3]![3] = second; board[4]![4] = second; board[3]![4] = starter; board[4]![3] = starter;
  return { board, turn: starter, winner: null, draw: false, moves: 0, starter };
}
function reduce(state: ReversiState, action: ReversiAction): ReversiState {
  if (action.type === 'restart') return state.winner || state.draw ? fresh(otherSeat(state.starter)) : state;
  if (state.winner || state.draw || !Number.isInteger(action.row) || !Number.isInteger(action.column)) return state;
  const flipped = captures(state.board, action.row, action.column, state.turn);
  if (!flipped.length) return state;
  const board = copyGrid(state.board); board[action.row]![action.column] = state.turn;
  for (const cell of flipped) board[cell.row]![cell.column] = state.turn;
  const opponent = otherSeat(state.turn), next = legalReversiMoves({ ...state, board, winner: null, draw: false }, opponent).length ? opponent : state.turn;
  const ended = !legalReversiMoves({ ...state, board, turn: next, winner: null, draw: false }, next).length;
  const [one, two] = score(board), winner = ended && one !== two ? (one > two ? 1 : 2) as GridSeat : null;
  return { ...state, board, moves: state.moves + 1, turn: next, winner, draw: ended && one === two };
}
const terminal = (state: ReversiState) => ({ ended: state.winner !== null || state.draw, winner: state.winner, draw: state.draw });
export const reversi: GameContract<ReversiState, ReversiAction, GridSeat, ReversiState> = {
  init: () => fresh(1), reduce,
  seatsToAct: (state) => terminal(state).ended ? [] : [state.turn], terminal,
  redact: (state) => ({ ...state, board: copyGrid(state.board) }),
};
