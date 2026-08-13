import { chooseGameMove } from './game-ai';
import type { GameId, GameState } from '../game/catalog';
const scope = self as unknown as { onmessage: ((event: MessageEvent<{ game: GameId; state: GameState; budgetMs: number }>) => void) | null; postMessage(message: unknown): void };
scope.onmessage = ({ data }) => scope.postMessage({ move: chooseGameMove(data.game, data.state, data.budgetMs) });
