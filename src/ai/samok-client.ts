import type { SamokState } from '../game/samok';
import { requestGameMove } from './game-client';
export const requestSamokMove = (state: SamokState, budgetMs = 800): Promise<number | null> => requestGameMove('samok', state, budgetMs) as Promise<number | null>;
