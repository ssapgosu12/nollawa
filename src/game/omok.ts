import type { GameContract, SharedGameState } from './contract';
import { copyGrid, emptyGrid, hasLine, otherSeat, type GridCell, type GridSeat } from './line-grid';
export type OmokAction = { type: 'place'; row: number; column: number } | { type: 'restart' };
export interface OmokState extends SharedGameState { board: GridCell[][]; turn: GridSeat; winner: GridSeat | null; draw: boolean; moves: number; starter: GridSeat }
export type OmokForbiddenKind = '삼삼' | '사사' | '장목';
const SIZE = 15, DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
const fresh = (starter: GridSeat): OmokState => ({ board: emptyGrid(SIZE), turn: starter, winner: null, draw: false, moves: 0, starter }), inside = (row: number, column: number) => row >= 0 && row < SIZE && column >= 0 && column < SIZE;
function run(board: readonly (readonly GridCell[])[], row: number, column: number, dr: number, dc: number) { let before = 0, after = 0; while (board[row - dr * (before + 1)]?.[column - dc * (before + 1)] === 1) before += 1; while (board[row + dr * (after + 1)]?.[column + dc * (after + 1)] === 1) after += 1; return { before, after, length: before + after + 1 }; }
function exactFiveThrough(board: readonly (readonly GridCell[])[], row: number, column: number, originRow: number, originColumn: number, dr: number, dc: number) { const span = run(board, row, column, dr, dc); return span.length === 5 && Array.from({ length: 5 }, (_, index) => index - span.before).some((step) => row + dr * step === originRow && column + dc * step === originColumn); }
function fourCount(board: GridCell[][], row: number, column: number) {
  const formations = new Set<string>();
  DIRECTIONS.forEach(([dr, dc], direction) => { for (let offset = -4; offset <= 4; offset += 1) { const targetRow = row + dr * offset, targetColumn = column + dc * offset; if (!inside(targetRow, targetColumn) || board[targetRow]?.[targetColumn] !== 0) continue; board[targetRow]![targetColumn] = 1; if (exactFiveThrough(board, targetRow, targetColumn, row, column, dr, dc)) { const span = run(board, targetRow, targetColumn, dr, dc); formations.add(`${direction}:${Array.from({ length: 5 }, (_, index) => index - span.before).filter((step) => step !== 0).map((step) => `${targetRow + dr * step},${targetColumn + dc * step}`).join('|')}`); } board[targetRow]![targetColumn] = 0; }});
  return formations.size;
}
function openThreeCount(board: GridCell[][], row: number, column: number) {
  const formations = new Set<string>();
  DIRECTIONS.forEach(([dr, dc], direction) => { for (let offset = -4; offset <= 4; offset += 1) { const targetRow = row + dr * offset, targetColumn = column + dc * offset; if (!inside(targetRow, targetColumn) || board[targetRow]?.[targetColumn] !== 0) continue; board[targetRow]![targetColumn] = 1; const span = run(board, targetRow, targetColumn, dr, dc), open = span.length === 4 && board[targetRow - dr * (span.before + 1)]?.[targetColumn - dc * (span.before + 1)] === 0 && board[targetRow + dr * (span.after + 1)]?.[targetColumn + dc * (span.after + 1)] === 0 && !DIRECTIONS.some(([nextDr, nextDc]) => run(board, targetRow, targetColumn, nextDr, nextDc).length >= 6) && fourCount(board, targetRow, targetColumn) < 2; if (open) formations.add(`${direction}:${Array.from({ length: 4 }, (_, index) => index - span.before).filter((step) => step !== 0).map((step) => `${targetRow + dr * step},${targetColumn + dc * step}`).join('|')}`); board[targetRow]![targetColumn] = 0; }});
  return formations.size;
}
export function omokForbiddenKind(state: OmokState, row: number, column: number): OmokForbiddenKind | null {
  if (state.turn !== 1 || !inside(row, column) || state.board[row]?.[column] !== 0) return null; const board = copyGrid(state.board); board[row]![column] = 1;
  if (DIRECTIONS.some(([dr, dc]) => run(board, row, column, dr, dc).length >= 6)) return '장목'; if (DIRECTIONS.some(([dr, dc]) => run(board, row, column, dr, dc).length === 5)) return null; if (fourCount(board, row, column) >= 2) return '사사'; return openThreeCount(board, row, column) >= 2 ? '삼삼' : null;
}
function reduce(state: OmokState, action: OmokAction): OmokState {
  if (action.type === 'restart') return state.winner || state.draw ? fresh(otherSeat(state.starter)) : state; if (state.winner || state.draw) return state;
  const { row, column } = action; if (!Number.isInteger(row) || !Number.isInteger(column) || !inside(row, column) || state.board[row]?.[column] !== 0 || omokForbiddenKind(state, row, column)) return state;
  const board = copyGrid(state.board); board[row]![column] = state.turn; const moves = state.moves + 1, winner = hasLine(board, row, column, state.turn, 5) ? state.turn : null;
  return { ...state, board, moves, winner, draw: !winner && moves === SIZE * SIZE, turn: otherSeat(state.turn) };
}
const terminal = (state: OmokState) => ({ ended: state.winner !== null || state.draw, winner: state.winner, draw: state.draw });
export const omok: GameContract<OmokState, OmokAction, GridSeat, OmokState> = {
  init: () => fresh(1), reduce, seatsToAct: (state) => terminal(state).ended ? [] : [state.turn], terminal, redact: (state) => ({ ...state, board: copyGrid(state.board) }),
};
