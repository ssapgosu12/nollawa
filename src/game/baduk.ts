import type { SharedGameState } from './contract';
import { copyGrid, emptyGrid, otherSeat, type GridCell, type GridSeat } from './line-grid';

export const BADUK_BOARD_SIZES = [9, 13, 19] as const;
export type BadukBoardSize = typeof BADUK_BOARD_SIZES[number];
export type BadukPhase = 'play' | 'scoring' | 'finished';
export type BadukPoint = { row: number; column: number };
export type BadukAction =
  | ({ type: 'place' } & BadukPoint)
  | { type: 'pass' }
  | ({ type: 'toggle-dead' } & BadukPoint)
  | { type: 'submit-score' }
  | { type: 'restart' };
export interface BadukScore {
  territory: Record<GridSeat, number>; prisoners: Record<GridSeat, number>; neutral: number;
  black: number; white: number; winner: GridSeat; margin: number; result: string;
}
export interface BadukState extends SharedGameState {
  board: GridCell[][]; previousBoard: GridCell[][] | null; turn: GridSeat; starter: GridSeat;
  winner: GridSeat | null; draw: false; moves: number; phase: BadukPhase; consecutivePasses: number;
  prisoners: Record<GridSeat, number>; deadMarks: Record<GridSeat, string[]>;
  submissions: Partial<Record<GridSeat, string[]>>; score: BadukScore | null; result: string | null;
}
export interface BadukReplayEvent { action: BadukAction; actor?: GridSeat }

const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
export const badukPointKey = ({ row, column }: BadukPoint): string => `${row}:${column}`;
const pointForKey = (key: string): BadukPoint => { const [row, column] = key.split(':').map(Number); return { row: row!, column: column! }; };
const inside = (board: readonly (readonly GridCell[])[], row: number, column: number) => row >= 0 && row < board.length && column >= 0 && column < board.length;
const sameBoard = (left: readonly (readonly GridCell[])[] | null, right: readonly (readonly GridCell[])[]) => left !== null && left.every((row, r) => row.every((cell, c) => cell === right[r]?.[c]));
const fresh = (starter: GridSeat = 1, size: BadukBoardSize = 13): BadukState => ({
  board: emptyGrid(size), previousBoard: null, turn: starter, starter, winner: null, draw: false, moves: 0,
  phase: 'play', consecutivePasses: 0, prisoners: { 1: 0, 2: 0 }, deadMarks: { 1: [], 2: [] },
  submissions: {}, score: null, result: null,
});

export function badukGroup(board: readonly (readonly GridCell[])[], origin: BadukPoint): BadukPoint[] {
  const seat = board[origin.row]?.[origin.column]; if (!seat) return [];
  const found: BadukPoint[] = [], pending = [origin], seen = new Set<string>();
  while (pending.length) { const point = pending.pop()!, key = badukPointKey(point); if (seen.has(key)) continue; seen.add(key); if (board[point.row]?.[point.column] !== seat) continue; found.push(point); for (const [dr, dc] of directions) pending.push({ row: point.row + dr, column: point.column + dc }); }
  return found;
}
export function badukLiberties(board: readonly (readonly GridCell[])[], origin: BadukPoint): BadukPoint[] {
  const liberties = new Map<string, BadukPoint>();
  for (const point of badukGroup(board, origin)) for (const [dr, dc] of directions) { const next = { row: point.row + dr, column: point.column + dc }; if (board[next.row]?.[next.column] === 0) liberties.set(badukPointKey(next), next); }
  return [...liberties.values()];
}
function placedBoard(state: BadukState, point: BadukPoint): { board: GridCell[][]; captured: number } | null {
  if (state.phase !== 'play' || !inside(state.board, point.row, point.column) || state.board[point.row]?.[point.column] !== 0) return null;
  const board = copyGrid(state.board); board[point.row]![point.column] = state.turn; const opponent = otherSeat(state.turn), captured = new Map<string, BadukPoint>();
  for (const [dr, dc] of directions) { const adjacent = { row: point.row + dr, column: point.column + dc }; if (board[adjacent.row]?.[adjacent.column] === opponent && badukLiberties(board, adjacent).length === 0) for (const stone of badukGroup(board, adjacent)) captured.set(badukPointKey(stone), stone); }
  for (const stone of captured.values()) board[stone.row]![stone.column] = 0;
  if (badukLiberties(board, point).length === 0 || sameBoard(state.previousBoard, board)) return null;
  return { board, captured: captured.size };
}
export const isLegalBadukPlacement = (state: BadukState, row: number, column: number): boolean => placedBoard(state, { row, column }) !== null;
export function legalBadukMoves(state: BadukState): BadukPoint[] {
  if (state.phase !== 'play') return [];
  return state.board.flatMap((row, r) => row.flatMap((cell, column) => cell === 0 && isLegalBadukPlacement(state, r, column) ? [{ row: r, column }] : []));
}

function territoryAfterRemoval(state: BadukState, marked: readonly string[]) {
  const board = copyGrid(state.board), prisoners = { ...state.prisoners }, markedSet = new Set(marked);
  for (const key of markedSet) { const { row, column } = pointForKey(key), seat = board[row]?.[column]; if (seat === 1 || seat === 2) { board[row]![column] = 0; prisoners[otherSeat(seat)] += 1; } }
  const territory: Record<GridSeat, number> = { 1: 0, 2: 0 }; let neutral = 0; const seen = new Set<string>();
  for (let row = 0; row < board.length; row += 1) for (let column = 0; column < board.length; column += 1) {
    const start = { row, column }, startKey = badukPointKey(start); if (board[row]?.[column] !== 0 || seen.has(startKey)) continue;
    const region: BadukPoint[] = [], pending = [start], borders = new Set<GridSeat>();
    while (pending.length) { const point = pending.pop()!, key = badukPointKey(point); if (seen.has(key) || board[point.row]?.[point.column] !== 0) continue; seen.add(key); region.push(point); for (const [dr, dc] of directions) { const next = { row: point.row + dr, column: point.column + dc }, cell = board[next.row]?.[next.column]; if (cell === 0) pending.push(next); else if (cell === 1 || cell === 2) borders.add(cell); } }
    if (borders.size === 1) territory[[...borders][0]!] += region.length; else neutral += region.length;
  }
  return { board, prisoners, territory, neutral };
}
export function scoreBaduk(state: BadukState, marked: readonly string[]): BadukScore {
  const { prisoners, territory, neutral } = territoryAfterRemoval(state, marked), blackSeat = state.starter, whiteSeat = otherSeat(blackSeat);
  const black = territory[blackSeat] + prisoners[blackSeat], white = territory[whiteSeat] + prisoners[whiteSeat] + 6.5, winner = black > white ? blackSeat : whiteSeat, margin = Math.abs(black - white), color = winner === blackSeat ? '흑' : '백';
  return { territory, prisoners, neutral, black, white, winner, margin, result: `${color} ${margin}집 승` };
}
export const badukPreviewFor = (state: BadukState, seat: GridSeat): BadukScore => scoreBaduk(state, state.deadMarks[seat]);
export const badukColorForSeat = (state: BadukState, seat: GridSeat): '흑' | '백' => seat === state.starter ? '흑' : '백';

function toggleDead(state: BadukState, actor: GridSeat, point: BadukPoint): BadukState {
  const group = badukGroup(state.board, point); if (!group.length) return state;
  const current = new Set(state.deadMarks[actor]), keys = group.map(badukPointKey), remove = keys.every((key) => current.has(key)); for (const key of keys) remove ? current.delete(key) : current.add(key);
  return { ...state, deadMarks: { ...state.deadMarks, [actor]: [...current].sort() }, submissions: { ...state.submissions, [actor]: undefined } };
}
function submit(state: BadukState, actor: GridSeat): BadukState {
  const submissions = { ...state.submissions, [actor]: [...state.deadMarks[actor]].sort() }, first = submissions[1], second = submissions[2]; if (!first || !second) return { ...state, submissions };
  if (first.join('|') !== second.join('|')) return { ...state, phase: 'play', consecutivePasses: 0, deadMarks: { 1: [], 2: [] }, submissions: {} };
  const score = scoreBaduk(state, first), { board } = territoryAfterRemoval(state, first);
  return { ...state, board, prisoners: score.prisoners, phase: 'finished', winner: score.winner, score, result: score.result, submissions };
}
export function reduceBaduk(state: BadukState, action: BadukAction, actor: GridSeat = state.turn): BadukState {
  if (action.type === 'restart') return state.phase === 'finished' ? fresh(otherSeat(state.starter), state.board.length as BadukBoardSize) : state;
  if (actor !== 1 && actor !== 2 || state.phase === 'finished') return state;
  if (state.phase === 'scoring') return action.type === 'toggle-dead' ? toggleDead(state, actor, action) : action.type === 'submit-score' ? submit(state, actor) : state;
  if (actor !== state.turn) return state;
  if (action.type === 'pass') { const consecutivePasses = state.consecutivePasses + 1; return { ...state, previousBoard: copyGrid(state.board), turn: otherSeat(state.turn), moves: state.moves + 1, consecutivePasses, phase: consecutivePasses === 2 ? 'scoring' : 'play', deadMarks: { 1: [], 2: [] }, submissions: {} }; }
  if (action.type !== 'place') return state; const placed = placedBoard(state, action); if (!placed) return state;
  return { ...state, board: placed.board, previousBoard: copyGrid(state.board), turn: otherSeat(state.turn), moves: state.moves + 1, consecutivePasses: 0, prisoners: { ...state.prisoners, [state.turn]: state.prisoners[state.turn] + placed.captured } };
}
export function replayBadukActions(events: readonly BadukReplayEvent[], size: BadukBoardSize = 13, starter: GridSeat = 1): BadukState { return events.reduce((state, event) => reduceBaduk(state, event.action, event.actor), fresh(starter, size)); }
export const baduk = { init: (size: BadukBoardSize = 13) => fresh(1, size), reduce: reduceBaduk, seatsToAct: (state: BadukState) => state.phase === 'scoring' ? [1, 2] as const : state.phase === 'play' ? [state.turn] : [], terminal: (state: BadukState) => ({ ended: state.phase === 'finished', winner: state.winner, draw: false }), redact: (state: BadukState) => ({ ...state, board: copyGrid(state.board), previousBoard: state.previousBoard && copyGrid(state.previousBoard) }) };
