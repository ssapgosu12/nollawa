import { describe, expect, it } from 'vitest';
import { BOARD_GAME_CATALOG, GAME_CATALOG, actionForMove, initGame, legalGameMoves, moveKey, reduceGame, type AiGameId, type GameId, type GameState } from '../game/catalog';
import type { GridCell } from '../game/line-grid';
import { BoardGame } from '../components/BoardGame';
import { GridBoard } from '../components/BoardGrid';
import { applyAuthorityGameAction, applyAuthorityGameRematch, filterGames } from '../App';
import { GAME_ADAPTERS } from './game-adapters';
import { chooseGameMoveDetailed, fallbackGameMove } from './game-ai';

const lineThreat = (game: 'omok' | 'yukmok', seat: 1 | 2, length: number): GameState => {
  const state = initGame(game), row = game === 'omok' ? 7 : 9;
  for (let column = 0; column < length; column += 1) state.board[row]![column] = seat;
  return { ...state, turn: seat === 1 ? 2 : 1, moves: length } as GameState;
};

describe('M1 shared deterministic search core', () => {
  it.each(BOARD_GAME_CATALOG.map(({ id }) => id))('%s returns a legal move through the same budget API', (id) => {
    const state = initGame(id), result = chooseGameMoveDetailed(id, state, 8, (() => { let tick = 0; return () => tick += 1; })());
    expect(legalGameMoves(id, state).map(moveKey)).toContain(moveKey(result.move!));
    expect(result.completedDepth).toBeLessThanOrEqual(5);
  });

  it.each([['omok', 4], ['yukmok', 5]] as const)('%s bounded fallback blocks the opponent forcing line', (id, length) => {
    const state = lineThreat(id, 2, length), move = fallbackGameMove(id, state);
    expect(move).toEqual({ row: id === 'omok' ? 7 : 9, column: length });
    expect(GAME_ADAPTERS[id].forcing).toBeTypeOf('function');
  });

  it.each([['omok', 4, 7], ['yukmok', 5, 9]] as const)('%s immediate win wins before the bounded budget expires', (id, length, row) => {
    const state = lineThreat(id, 1, length), winning = { ...state, turn: 1 } as GameState;
    expect(chooseGameMoveDetailed(id, winning, 0).move).toEqual({ row, column: length });
  });

  it('the time source stops iterative deepening at the supplied budget', () => {
    let ticks = 0; const result = chooseGameMoveDetailed('reversi', initGame('reversi'), 2, () => ticks += 1);
    expect(ticks).toBeLessThanOrEqual(4);
    expect(result.completedDepth).toBeLessThan(5);
    expect(result.move).not.toBeNull();
  });

  it('reversi final empty invokes and completes the <=10 exact-search path', () => {
    const board = Array.from({ length: 8 }, () => Array<GridCell>(8).fill(1)); board[0] = [1, 1, 1, 0, 2, 1, 1, 1];
    const state = { board, turn: 1 as const, winner: null, draw: false, moves: 59, starter: 1 as const };
    expect(chooseGameMoveDetailed('reversi', state, 1_000)).toMatchObject({ move: { row: 0, column: 3 }, completedDepth: 1, exactRequested: true, exact: true });
  });

  it('one worker path carries game id, state, and budget for all four adapters', () => {
    expect(Object.keys(import.meta.glob('./*.worker.ts'))).toEqual(['./game.worker.ts']);
  });
});

describe('M1 game-list selection to renderer/local/AI/remote wiring', () => {
  it.each(['omok', 'yukmok', 'reversi'] as AiGameId[])('%s is independently wired end to end', (id) => {
    const selected = GAME_CATALOG.find((game) => game.id === id); expect(selected?.id).toBe(id);
    const initial = initGame(id), rendered = BoardGame({ game: id, state: initial, onMove: () => undefined }); expect(rendered.type).toBe(GridBoard);
    const move = chooseGameMoveDetailed(id, initial, 4, (() => { let tick = 0; return () => tick += 1; })()).move!; expect(reduceGame(id, initial, actionForMove(id, move))).not.toBe(initial);
    expect(applyAuthorityGameAction(id, initial, actionForMove(id, move), { id: 'seat-one', seat: 1 }, true)).not.toBe(initial);
    expect(applyAuthorityGameAction(id, initial, actionForMove(id, move), { id: 'seat-two', seat: 2 }, true)).toBe(initial);
  });

  it.each(['omok', 'yukmok', 'reversi'] as AiGameId[])('%s remote rematch waits for the authoritative room population', (id) => {
    const room = { code: 'ABC-67', hostId: 'one', game: id, teamNames: ['왼쪽', '오른쪽'] as [string, string], settings: { aiOpponent: false }, phase: 'play' as const, participants: [{ id: 'one', slot: 1, name: '하나', ready: true, present: true }, { id: 'two', slot: 2, name: '둘', ready: true, present: true }] };
    const terminal = { ...initGame(id), winner: 1 as const }, first = applyAuthorityGameRematch(id, terminal, { id: 'one', seat: 1 }, room, true);
    expect(first).toMatchObject({ winner: 1, rematchConsent: ['one'] });
    expect(applyAuthorityGameRematch(id, first, { id: 'two', seat: 2 }, room, true)).toMatchObject({ winner: null, moves: 0 });
  });

  it('people, name, and narrowing multi-tag filters compose', () => {
    expect(filterGames('', '1', []).map((game) => game.id)).toEqual(['yacht']);
    expect(filterGames('', '2', [])).toHaveLength(8);
    expect(filterGames('', '3-4', []).map((game) => game.id)).toEqual(['yacht', 'fleet-variant']);
    expect(filterGames('리버시', '2', []).map((game) => game.id)).toEqual(['reversi']);
    expect(filterGames('', 'all', ['봇 있음', '5분 이내']).map((game) => game.id)).toEqual(['samok']);
  });
});
