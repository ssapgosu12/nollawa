import type { SamokState } from '../game/samok';
import { chooseGameMove, fallbackGameMove } from './game-ai';
export const greedySamokMove = (state: SamokState): number | null => fallbackGameMove('samok', state) as number | null;
export const chooseSamokMove = (state: SamokState, budgetMs = 800): number | null => chooseGameMove('samok', state, budgetMs) as number | null;
