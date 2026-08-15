import { actionForMove, legalGameMoves, moveKey, reduceGame, terminalGame, type AiGameId, type GameMove, type GameState } from '../game/catalog';
import type { Seat } from '../game/samok';
const WIN = 1_000_000, other = (seat: Seat): Seat => seat === 1 ? 2 : 1;
export interface GameAdapter {
  legalMoves(state: GameState): GameMove[]; apply(state: GameState, move: GameMove): GameState;
  terminal(state: GameState): ReturnType<typeof terminalGame>; evaluate(state: GameState, seat: Seat): number; key(state: GameState): string;
  forcing?(before: GameState, after: GameState): boolean; exactDepth?(state: GameState): number | null; blockable?: boolean;
}
function lineValue(board: readonly (readonly number[])[], seat: Seat, target: number): number {
  let score = 0;
  for (let row = 0; row < board.length; row += 1) for (let column = 0; column < (board[row]?.length ?? 0); column += 1) for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
    const cells = Array.from({ length: target }, (_, step) => board[row + dr * step]?.[column + dc * step]); if (cells.some((cell) => cell === undefined) || (cells.includes(seat) && cells.includes(other(seat)))) continue;
    const own = cells.filter((cell) => cell === seat).length, foe = cells.filter((cell) => cell === other(seat)).length; score += own ? 4 ** own : foe ? -(5 ** foe) : 0;
  }
  return score;
}
function longest(board: readonly (readonly number[])[], seat: Seat): number {
  let best = 0;
  for (let row = 0; row < board.length; row += 1) for (let column = 0; column < (board[row]?.length ?? 0); column += 1) if (board[row]?.[column] === seat) for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) { let count = 1; while (board[row + dr * count]?.[column + dc * count] === seat) count += 1; best = Math.max(best, count); }
  return best;
}
const base = (id: AiGameId, evaluate: GameAdapter['evaluate']): GameAdapter => ({
  legalMoves: (state) => legalGameMoves(id, state), apply: (state, move) => reduceGame(id, state, actionForMove(id, move)), terminal: (state) => terminalGame(id, state), evaluate,
  key: (state) => `${state.turn}|${'stonesLeft' in state ? state.stonesLeft : ''}|${state.board.flat().join('')}`, blockable: true,
});
const lineAdapter = (id: AiGameId, target: number): GameAdapter => ({ ...base(id, (state, seat) => lineValue(state.board, seat, target)), forcing: (before, after) => longest(after.board, before.turn) >= target - 1 });
export const GAME_ADAPTERS: Record<AiGameId, GameAdapter> = {
  samok: lineAdapter('samok', 4), omok: lineAdapter('omok', 5), yukmok: lineAdapter('yukmok', 6),
  reversi: { ...base('reversi', (state, seat) => { const flat = state.board.flat(), corners = [flat[0], flat[7], flat[56], flat[63]]; return flat.filter((cell) => cell === seat).length - flat.filter((cell) => cell === other(seat)).length + 20 * (corners.filter((cell) => cell === seat).length - corners.filter((cell) => cell === other(seat)).length); }), blockable: false, exactDepth: (state) => { const empty = state.board.flat().filter((cell) => cell === 0).length; return empty <= 10 ? empty : null; } },
};
for (const adapter of Object.values(GAME_ADAPTERS)) { const heuristic = adapter.evaluate; adapter.evaluate = (state, seat) => { const end = adapter.terminal(state); return end.ended ? end.draw ? 0 : end.winner === seat ? WIN : -WIN : heuristic(state, seat); }; }
export const adapterFor = (id: AiGameId): GameAdapter => GAME_ADAPTERS[id];
export const adapterMoveKeys = (id: AiGameId, state: GameState): string[] => adapterFor(id).legalMoves(state).map(moveKey);
