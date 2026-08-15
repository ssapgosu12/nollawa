import { actionForMove, legalGameMoves, moveKey, type AiGameId, type GameMove, type GameState } from '../game/catalog';
import { fallbackGameMove } from './game-ai';
export function requestGameMove(game: AiGameId, state: GameState, budgetMs: number): Promise<GameMove | null> {
  const fallback = fallbackGameMove(game, state), legal = legalGameMoves(game, state).map(moveKey);
  return new Promise((resolve) => {
    let worker: Worker; try { worker = new Worker(new URL('./game.worker.ts', import.meta.url)); } catch { resolve(fallback); return; }
    let settled = false; const finish = (move: GameMove | null) => { if (settled) return; settled = true; worker.terminate(); resolve(move !== null && legal.includes(moveKey(move)) ? move : fallback); };
    const timer = window.setTimeout(() => finish(fallback), Math.max(1, budgetMs + 50));
    worker.onmessage = (event: MessageEvent<{ move: GameMove | null }>) => { window.clearTimeout(timer); finish(event.data.move); };
    worker.onerror = () => { window.clearTimeout(timer); finish(fallback); };
    worker.postMessage({ game, state, budgetMs });
  });
}
export const requestedAction = (game: AiGameId, move: GameMove | null) => move === null ? null : actionForMove(game, move);
