import { omok, type OmokAction, type OmokState } from './omok';
import { reversi, legalReversiMoves, type ReversiAction, type ReversiState } from './reversi';
import { legalColumns, samok, type SamokAction, type SamokState, type Seat } from './samok';
import { yukmok, type YukmokAction, type YukmokState } from './yukmok';
import type { GameMove, GameMoveKey, GridMove } from './contract';
export type { GameMove, GameMoveKey, GridMove } from './contract';
export type GameId = 'samok' | 'omok' | 'yukmok' | 'reversi';
export type GameState = SamokState | OmokState | YukmokState | ReversiState;
export type GameAction = SamokAction | OmokAction | YukmokAction | ReversiAction;
export type VoteAction = { type: 'vote'; move: GameMoveKey };
export type GameWireAction = GameAction | VoteAction;
export const GAME_CATALOG = [
  { id: 'samok', name: '사목', people: '2인', time: '5분', tags: ['봇 있음', '대전', '5분 이내'] },
  { id: 'omok', name: '오목', people: '2인', time: '10분', tags: ['봇 있음', '대전'] },
  { id: 'yukmok', name: '육목', people: '2인', time: '15분', tags: ['봇 있음', '대전'] },
  { id: 'reversi', name: '리버시', people: '2인', time: '15분', tags: ['봇 있음', '대전'] },
] as const;
export const gameId = (value: string): GameId => GAME_CATALOG.some((game) => game.id === value) ? value as GameId : 'samok';
export function initGame(id: GameId): GameState { switch (id) { case 'omok': return omok.init(); case 'yukmok': return yukmok.init(); case 'reversi': return reversi.init(); default: return samok.init(); } }
export function reduceGame(id: GameId, state: GameState, action: GameAction): GameState {
  switch (id) { case 'omok': return omok.reduce(state as OmokState, action as OmokAction); case 'yukmok': return yukmok.reduce(state as YukmokState, action as YukmokAction); case 'reversi': return reversi.reduce(state as ReversiState, action as ReversiAction); default: return samok.reduce(state as SamokState, action as SamokAction); }
}
export function terminalGame(id: GameId, state: GameState) { switch (id) { case 'omok': return omok.terminal(state as OmokState); case 'yukmok': return yukmok.terminal(state as YukmokState); case 'reversi': return reversi.terminal(state as ReversiState); default: return samok.terminal(state as SamokState); } }
export function legalGameMoves(id: GameId, state: GameState): GameMove[] {
  if (terminalGame(id, state).ended) return [];
  if (id === 'samok') return legalColumns(state as SamokState);
  if (id === 'reversi') return legalReversiMoves(state as ReversiState);
  const swap: GameMove[] = id === 'omok' && (state as OmokState).swapAvailable ? [{ kind: 'swap' }] : [];
  const board = state.board, center = (board.length - 1) / 2;
  return [...swap, ...board.flatMap((row, r) => row.map((cell, column) => ({ cell, row: r, column }))).filter(({ cell }) => cell === 0).sort((a, b) => Math.abs(a.row - center) + Math.abs(a.column - center) - Math.abs(b.row - center) - Math.abs(b.column - center)).map(({ row, column }) => ({ row, column }))];
}
export const actionForMove = (id: GameId, move: GameMove): GameAction => typeof move === 'object' && 'kind' in move ? { type: 'swap' } : id === 'samok' ? { type: 'drop', column: move as number } : { type: id === 'reversi' ? 'move' : 'place', ...(move as GridMove) } as GameAction;
export const restartAction = (): GameAction => ({ type: 'restart' });
export const moveKey = (move: GameMove): GameMoveKey => typeof move === 'number' ? `${move}` : 'kind' in move ? move.kind : `${move.row}:${move.column}`;
export const moveForKey = (id: GameId, state: GameState, key: GameMoveKey): GameMove | null => legalGameMoves(id, state).find((move) => moveKey(move) === key) ?? null;
export const legalGameMoveKeys = (id: GameId, state: GameState): GameMoveKey[] => legalGameMoves(id, state).map(moveKey);
export function reduceGameMove(id: GameId, state: GameState, key: GameMoveKey): GameState { const move = moveForKey(id, state, key); return move === null ? state : reduceGame(id, state, actionForMove(id, move)); }
export const voteActionForMove = (move: GameMove): VoteAction => ({ type: 'vote', move: moveKey(move) });
export const seatToAct = (state: GameState): Seat => state.turn;
