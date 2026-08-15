import { chooseGameMove } from './game-ai';
import type { AiGameId, GameState } from '../game/catalog';
const scope = self as unknown as { onmessage: ((event: MessageEvent<{ game: AiGameId; state: GameState; budgetMs: number }>) => void) | null; postMessage(message: unknown): void };
scope.onmessage = ({ data }) => scope.postMessage({ move: chooseGameMove(data.game, data.state, data.budgetMs) });
