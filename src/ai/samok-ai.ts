import { legalColumns, samok, type SamokState, type Seat } from '../game/samok';
const ORDER = [3, 2, 4, 1, 5, 0, 6];
function scoreWindow(values: number[], seat: Seat): number {
  const opponent = seat === 1 ? 2 : 1;
  const own = values.filter((value) => value === seat).length;
  const theirs = values.filter((value) => value === opponent).length;
  const empty = 4 - own - theirs;
  if (own && theirs) return 0;
  if (own === 4) return 100_000;
  if (theirs === 4) return -100_000;
  if (own === 3 && empty === 1) return 120;
  if (theirs === 3 && empty === 1) return -150;
  if (own === 2 && empty === 2) return 12;
  if (theirs === 2 && empty === 2) return -14;
  return own - theirs;
}
function evaluate(state: SamokState, seat: Seat): number {
  if (state.winner === seat) return 1_000_000;
  if (state.winner) return -1_000_000;
  if (state.draw) return 0;
  let score = 0;
  for (let row = 0; row < 6; row += 1) {
    if (state.board[row]?.[3] === seat) score += 5;
    for (let column = 0; column < 7; column += 1) {
      for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
        const endRow = row + dr * 3;
        const endColumn = column + dc * 3;
        if (endRow < 0 || endRow >= 6 || endColumn < 0 || endColumn >= 7) continue;
        score += scoreWindow([0, 1, 2, 3].map((step) => state.board[row + dr * step]?.[column + dc * step] ?? 0), seat);
      }
    }
  }
  return score;
}
function minimax(state: SamokState, depth: number, seat: Seat, alpha: number, beta: number): number {
  if (depth === 0 || samok.terminal(state).ended) return evaluate(state, seat);
  const maximizing = state.turn === seat;
  let best = maximizing ? -Infinity : Infinity;
  for (const column of ORDER.filter((candidate) => legalColumns(state).includes(candidate))) {
    const next = samok.reduce(state, { type: 'drop', column });
    const value = minimax(next, depth - 1, seat, alpha, beta);
    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}
export function greedySamokMove(state: SamokState): number | null {
  const legal = ORDER.filter((column) => legalColumns(state).includes(column));
  for (const column of legal) {
    if (samok.reduce(state, { type: 'drop', column }).winner === state.turn) return column;
  }
  const opponent = state.turn === 1 ? 2 : 1;
  const threatState = { ...state, turn: opponent as Seat };
  for (const column of legal) {
    if (samok.reduce(threatState, { type: 'drop', column }).winner === opponent) return column;
  }
  return legal[0] ?? null;
}
export function chooseSamokMove(state: SamokState): number | null {
  const seat = state.turn;
  let bestColumn = greedySamokMove(state);
  let bestScore = -Infinity;
  for (const column of ORDER.filter((candidate) => legalColumns(state).includes(candidate))) {
    const next = samok.reduce(state, { type: 'drop', column });
    const value = minimax(next, 4, seat, -Infinity, Infinity);
    if (value > bestScore) {
      bestScore = value;
      bestColumn = column;
    }
  }
  return bestColumn;
}
