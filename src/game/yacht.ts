export const YACHT_CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'choice', 'four-kind', 'full-house', 'small-straight', 'large-straight', 'yacht',
] as const;

export type YachtCategory = typeof YACHT_CATEGORIES[number];
export type YachtDie = 1 | 2 | 3 | 4 | 5 | 6;
export type YachtPhase = 'rolling' | 'scoring' | 'complete';

export interface YachtScoreEntry {
  category: YachtCategory;
  dice: readonly YachtDie[];
}

export interface YachtScoreCard {
  scores: Partial<Record<YachtCategory, number>>;
  upperSubtotal: number;
  upperBonus: number;
  lowerSubtotal: number;
  total: number;
}

export interface YachtHandoff {
  entry: YachtScoreEntry;
  card: YachtScoreCard;
}

export interface YachtTurnState {
  dice: readonly YachtDie[] | null;
  held: readonly boolean[];
  rolls: number;
  phase: YachtPhase;
  entries: readonly YachtScoreEntry[];
  handoff: YachtHandoff | null;
}

export type YachtTurnAction =
  | { type: 'roll'; dice: unknown }
  | { type: 'toggle-hold'; index: number }
  | { type: 'stop' }
  | { type: 'register'; category: YachtCategory };

const UPPER = YACHT_CATEGORIES.slice(0, 6) as readonly YachtCategory[];
const CATEGORY_SET = new Set<string>(YACHT_CATEGORIES);
const CATEGORY_MAXIMUMS: Record<YachtCategory, number> = {
  ones: 5, twos: 10, threes: 15, fours: 20, fives: 25, sixes: 30,
  choice: 30, 'four-kind': 30, 'full-house': 30,
  'small-straight': 15, 'large-straight': 30, yacht: 50,
};

export const YACHT_MAXIMUM_SCORE = Object.values(CATEGORY_MAXIMUMS)
  .reduce((total, score) => total + score, 35);

export function isYachtDice(value: unknown): value is readonly YachtDie[] {
  return Array.isArray(value) && value.length === 5
    && value.every((die) => Number.isInteger(die) && die >= 1 && die <= 6);
}

function countsOf(dice: readonly YachtDie[]): number[] {
  const counts = Array<number>(7).fill(0);
  for (const die of dice) counts[die] = (counts[die] ?? 0) + 1;
  return counts;
}

export function scoreYachtCategory(category: YachtCategory, dice: readonly YachtDie[]): number {
  if (!CATEGORY_SET.has(category) || !isYachtDice(dice)) throw new RangeError('Invalid Yacht category or dice');
  const counts = countsOf(dice);
  const sum = dice.reduce<number>((total, die) => total + die, 0);
  const upperIndex = UPPER.indexOf(category);
  if (upperIndex >= 0) return (counts[upperIndex + 1] ?? 0) * (upperIndex + 1);
  if (category === 'choice') return sum;
  if (category === 'four-kind') return counts.some((count) => count >= 4) ? sum : 0;
  if (category === 'full-house') {
    const groups = counts.filter((count) => count > 0).sort((a, b) => a - b);
    return groups.length === 2 && groups[0] === 2 && groups[1] === 3 ? sum : 0;
  }
  const unique = new Set(dice);
  if (category === 'small-straight') {
    return [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]
      .some((run) => run.every((die) => unique.has(die as YachtDie))) ? 15 : 0;
  }
  if (category === 'large-straight') {
    const ordered = [...dice].sort((a, b) => a - b).join('');
    return ordered === '12345' || ordered === '23456' ? 30 : 0;
  }
  return counts.some((count) => count === 5) ? 50 : 0;
}

function validateEntries(entries: readonly YachtScoreEntry[]): void {
  const used = new Set<YachtCategory>();
  for (const entry of entries) {
    if (!CATEGORY_SET.has(entry.category) || !isYachtDice(entry.dice) || used.has(entry.category)) {
      throw new RangeError('Invalid Yacht score entries');
    }
    used.add(entry.category);
  }
}

export function scoreYachtCard(entries: readonly YachtScoreEntry[]): YachtScoreCard {
  validateEntries(entries);
  const scores: Partial<Record<YachtCategory, number>> = {};
  for (const entry of entries) scores[entry.category] = scoreYachtCategory(entry.category, entry.dice);
  const upperSubtotal = UPPER.reduce((total, category) => total + (scores[category] ?? 0), 0);
  const upperBonus = upperSubtotal >= 63 ? 35 : 0;
  const lowerSubtotal = YACHT_CATEGORIES.slice(6)
    .reduce((total, category) => total + (scores[category] ?? 0), 0);
  return { scores, upperSubtotal, upperBonus, lowerSubtotal, total: upperSubtotal + upperBonus + lowerSubtotal };
}

export function createYachtTurn(entries: readonly YachtScoreEntry[] = []): YachtTurnState {
  validateEntries(entries);
  return {
    dice: null,
    held: [false, false, false, false, false],
    rolls: 0,
    phase: 'rolling',
    entries: entries.map((entry) => ({ ...entry, dice: [...entry.dice] })),
    handoff: null,
  };
}

export function reduceYachtTurn(state: YachtTurnState, action: YachtTurnAction): YachtTurnState {
  if (state.phase === 'complete') return state;
  if (action.type === 'roll') {
    if (state.phase !== 'rolling' || state.rolls >= 3 || !isYachtDice(action.dice)) return state;
    const dice = state.dice === null
      ? [...action.dice]
      : action.dice.map((die, index) => state.held[index] ? state.dice?.[index] ?? die : die);
    const rolls = state.rolls + 1;
    return { ...state, dice, rolls, phase: rolls === 3 ? 'scoring' : 'rolling' };
  }
  if (action.type === 'toggle-hold') {
    if (state.phase !== 'rolling' || state.dice === null || !Number.isInteger(action.index)
      || action.index < 0 || action.index >= 5) return state;
    const held = [...state.held];
    held[action.index] = !held[action.index];
    return { ...state, held };
  }
  if (action.type === 'stop') {
    return state.phase === 'rolling' && state.dice !== null ? { ...state, phase: 'scoring' } : state;
  }
  if (state.phase !== 'scoring' || state.dice === null
    || !CATEGORY_SET.has(action.category)
    || state.entries.some((entry) => entry.category === action.category)) return state;
  const entry: YachtScoreEntry = { category: action.category, dice: [...state.dice] };
  const entries = [...state.entries, entry];
  return { ...state, entries, phase: 'complete', handoff: { entry, card: scoreYachtCard(entries) } };
}
