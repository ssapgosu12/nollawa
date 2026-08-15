import { baduk, BADUK_BOARD_SIZES, legalBadukMoves, type BadukAction, type BadukBoardSize, type BadukState } from './baduk';
import { BOARD_SIZES, omok, omokForbiddenKind, type BoardSize as LineBoardSize, type OmokAction, type OmokState } from './omok';
import { reversi, legalReversiMoves, type ReversiAction, type ReversiState } from './reversi';
import { legalColumns, samok, type SamokAction, type SamokState, type Seat } from './samok';
import { yukmok, type YukmokAction, type YukmokState } from './yukmok';
import type { GameMove, GameMoveKey, GridMove } from './contract';
export type { GameMove, GameMoveKey, GridMove } from './contract';
export { BOARD_SIZES } from './omok'; export { BADUK_BOARD_SIZES } from './baduk';
export type BoardSize = LineBoardSize | BadukBoardSize;
export type GameId = 'samok' | 'omok' | 'yukmok' | 'reversi' | 'baduk'; export type AiGameId = Exclude<GameId, 'baduk'>; export type GameState = SamokState | OmokState | YukmokState | ReversiState | BadukState; export type GameAction = SamokAction | OmokAction | YukmokAction | ReversiAction | BadukAction;
export type CatalogGameId = GameId | 'yacht' | 'fleet' | 'fleet-variant';
export type VoteAction = { type: 'vote'; move: GameMoveKey }; export type GameWireAction = GameAction | VoteAction;
export const BOARD_GAME_CATALOG = [{ id: 'samok', name: '사목', people: '2인', minPlayers: 2, maxPlayers: 2, time: '5분', tags: ['봇 있음', '대전', '5분 이내'] }, { id: 'omok', name: '오목', people: '2인', minPlayers: 2, maxPlayers: 2, time: '10분', tags: ['봇 있음', '대전'] }, { id: 'yukmok', name: '육목', people: '2인', minPlayers: 2, maxPlayers: 2, time: '15분', tags: ['봇 있음', '대전'] }, { id: 'reversi', name: '리버시', people: '2인', minPlayers: 2, maxPlayers: 2, time: '15분', tags: ['봇 있음', '대전'] }] as const;
export const GAME_CATALOG = [...BOARD_GAME_CATALOG, { id: 'baduk', name: '바둑', people: '2인', minPlayers: 2, maxPlayers: 2, time: '30분', tags: ['대전', '심판'] }, { id: 'yacht', name: '요트 다이스', people: '1–4인', minPlayers: 1, maxPlayers: 4, time: '30분', tags: ['파티', '주사위'] }, { id: 'fleet', name: '함대 격침', people: '2인', minPlayers: 2, maxPlayers: 2, time: '30분', tags: ['파티', '전략'] }, { id: 'fleet-variant', name: '함대 격침 변형', people: '2–6인', minPlayers: 2, maxPlayers: 6, time: '30분', tags: ['파티', '전략', '개인전'] }] as const;
export const isBoardGameId = (value: string): value is GameId => value === 'baduk' || BOARD_GAME_CATALOG.some((game) => game.id === value);
export const isAiGameId = (value: string): value is AiGameId => BOARD_GAME_CATALOG.some((game) => game.id === value);
export const gameId = (value: string): GameId => isBoardGameId(value) ? value : 'samok';
export const catalogGameId = (value: string): CatalogGameId => GAME_CATALOG.some((game) => game.id === value) ? value as CatalogGameId : 'samok';
export const hasBoardSize = (id: string): boolean => id === 'omok' || id === 'yukmok' || id === 'baduk';
export const boardSizesFor = (id: string): readonly BoardSize[] => id === 'baduk' ? BADUK_BOARD_SIZES : BOARD_SIZES;
const lineSize = (size: BoardSize): LineBoardSize => size === 9 ? 13 : size;
export function initGame(id: GameId, size: BoardSize = 13): GameState { switch (id) { case 'baduk': return baduk.init((BADUK_BOARD_SIZES.includes(size as BadukBoardSize) ? size : 13) as BadukBoardSize); case 'omok': return omok.init(lineSize(size)); case 'yukmok': return yukmok.init(lineSize(size)); case 'reversi': return reversi.init(); default: return samok.init(); } }
export function reduceGame(id: GameId, state: GameState, action: GameAction): GameState {
  switch (id) { case 'baduk': return baduk.reduce(state as BadukState, action as BadukAction); case 'omok': return omok.reduce(state as OmokState, action as OmokAction); case 'yukmok': return yukmok.reduce(state as YukmokState, action as YukmokAction); case 'reversi': return reversi.reduce(state as ReversiState, action as ReversiAction); default: return samok.reduce(state as SamokState, action as SamokAction); }
}
export function terminalGame(id: GameId, state: GameState) { switch (id) { case 'baduk': return baduk.terminal(state as BadukState); case 'omok': return omok.terminal(state as OmokState); case 'yukmok': return yukmok.terminal(state as YukmokState); case 'reversi': return reversi.terminal(state as ReversiState); default: return samok.terminal(state as SamokState); } }
export function legalGameMoves(id: GameId, state: GameState): GameMove[] {
  if (terminalGame(id, state).ended) return [];
  if (id === 'baduk') return legalBadukMoves(state as BadukState);
  if (id === 'samok') return legalColumns(state as SamokState);
  if (id === 'reversi') return legalReversiMoves(state as ReversiState);
  const board = state.board, center = (board.length - 1) / 2;
  return board.flatMap((row, r) => row.map((cell, column) => ({ cell, row: r, column }))).filter(({ cell, row, column }) => cell === 0 && (id !== 'omok' || !omokForbiddenKind(state as OmokState, row, column))).sort((a, b) => Math.abs(a.row - center) + Math.abs(a.column - center) - Math.abs(b.row - center) - Math.abs(b.column - center)).map(({ row, column }) => ({ row, column }));
}
export const actionForMove = (id: GameId, move: GameMove): GameAction => id === 'samok' ? { type: 'drop', column: move as number } : { type: id === 'reversi' ? 'move' : 'place', ...(move as GridMove) } as GameAction;
export const restartAction = (): GameAction => ({ type: 'restart' });
export const moveKey = (move: GameMove): GameMoveKey => typeof move === 'number' ? `${move}` : `${move.row}:${move.column}`;
export const moveForKey = (id: GameId, state: GameState, key: GameMoveKey): GameMove | null => legalGameMoves(id, state).find((move) => moveKey(move) === key) ?? null;
export const legalGameMoveKeys = (id: GameId, state: GameState): GameMoveKey[] => legalGameMoves(id, state).map(moveKey);
export function reduceGameMove(id: GameId, state: GameState, key: GameMoveKey): GameState { const move = moveForKey(id, state, key); return move === null ? state : reduceGame(id, state, actionForMove(id, move)); }
export const voteActionForMove = (move: GameMove): VoteAction => ({ type: 'vote', move: moveKey(move) });
export const seatToAct = (state: GameState): Seat => state.turn;
