export type GridSeat = 1 | 2;
export type GridCell = 0 | GridSeat;
export const otherSeat = (seat: GridSeat): GridSeat => seat === 1 ? 2 : 1;
export const emptyGrid = (size: number): GridCell[][] => Array.from({ length: size }, () => Array<GridCell>(size).fill(0));
export function hasLine(board: readonly (readonly GridCell[])[], row: number, column: number, seat: GridSeat, target: number): boolean {
  return ([[1, 0], [0, 1], [1, 1], [1, -1]] as const).some(([dr, dc]) => {
    let count = 1;
    for (const sign of [-1, 1]) for (let step = 1; board[row + dr * step * sign]?.[column + dc * step * sign] === seat; step += 1) count += 1;
    return count >= target;
  });
}
export const copyGrid = (board: readonly (readonly GridCell[])[]): GridCell[][] => board.map((line) => [...line]);
