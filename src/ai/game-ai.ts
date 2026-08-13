import { moveKey, type GameId, type GameMove, type GameState } from '../game/catalog';
import type { Seat } from '../game/samok';
import { adapterFor } from './game-adapters';
const TIME = Symbol('budget');
const other = (seat: Seat): Seat => seat === 1 ? 2 : 1;
function immediate(adapter: ReturnType<typeof adapterFor>, state: GameState, seat: Seat): GameMove | null { for (const move of adapter.legalMoves(state)) if (adapter.terminal(adapter.apply(state, move)).winner === seat) return move; return null; }
export function fallbackGameMove(id: GameId, state: GameState): GameMove | null {
  const adapter = adapterFor(id), win = immediate(adapter, state, state.turn); if (win !== null) return win;
  if (adapter.blockable) { const threat = immediate(adapter, { ...state, turn: other(state.turn) } as GameState, other(state.turn)); if (threat !== null && adapter.legalMoves(state).some((move) => moveKey(move) === moveKey(threat))) return threat; }
  return adapter.legalMoves(state)[0] ?? null;
}
export interface SearchResult { move: GameMove | null; completedDepth: number; exactRequested: boolean; exact: boolean }
export function chooseGameMoveDetailed(id: GameId, state: GameState, budgetMs: number, now: () => number = () => performance.now()): SearchResult {
  const adapter = adapterFor(id), started = now(), deadline = started + Math.max(0, budgetMs), seat = state.turn, fallback = fallbackGameMove(id, state), exactDepth = adapter.exactDepth?.(state) ?? null;
  const exactRequested = exactDepth !== null, target = exactDepth ?? 5, table = new Map<string, number>(); let best = fallback, completedDepth = 0;
  const search = (position: GameState, depth: number, alpha: number, beta: number, extensions: number): number => {
    if (now() >= deadline) throw TIME; const end = adapter.terminal(position); if (end.ended || depth === 0) return adapter.evaluate(position, seat);
    const key = `${depth}|${adapter.key(position)}`, cached = table.get(key); if (cached !== undefined) return cached;
    const maximizing = position.turn === seat; let value = maximizing ? -Infinity : Infinity, cutoff = false, moves = adapter.legalMoves(position), limited = exactRequested ? moves : moves.slice(0, 18);
    for (const move of limited) { const next = adapter.apply(position, move), forcing = extensions > 0 && adapter.forcing?.(position, next) === true; const score = search(next, depth - (forcing ? 0 : 1), alpha, beta, forcing ? extensions - 1 : extensions); if (maximizing) { value = Math.max(value, score); alpha = Math.max(alpha, value); } else { value = Math.min(value, score); beta = Math.min(beta, value); } if (beta <= alpha) { cutoff = true; break; } }
    if (!cutoff) table.set(key, value); return value;
  };
  for (let depth = 1; depth <= target; depth += 1) try { let round = best, score = -Infinity; for (const move of adapter.legalMoves(state)) { const value = search(adapter.apply(state, move), depth - 1, -Infinity, Infinity, 2); if (value > score) { score = value; round = move; } } best = round; completedDepth = depth; } catch (error) { if (error !== TIME) throw error; break; }
  return { move: best, completedDepth, exactRequested, exact: exactRequested && completedDepth === target };
}
export const chooseGameMove = (id: GameId, state: GameState, budgetMs: number): GameMove | null => chooseGameMoveDetailed(id, state, budgetMs).move;
