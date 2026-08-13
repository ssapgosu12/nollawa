import type { ComponentChildren } from 'preact';
export type GridLayout = 'slots' | 'cells' | 'intersections';
export interface GridGeometry { rows: number; columns: number; layout: GridLayout; footer?: number }
export const BOARD_GEOMETRIES = {
  samok: { rows: 6, columns: 7, layout: 'slots', footer: 50 },
  omok: { rows: 15, columns: 15, layout: 'intersections' },
  yukmok: { rows: 19, columns: 19, layout: 'intersections' },
  reversi: { rows: 8, columns: 8, layout: 'cells' },
} as const satisfies Record<string, GridGeometry>;
export const snapCellPixels = (available: number, cells: number): number => Math.max(1, Math.floor(available / cells));
export const stoneDitherEnabled = (diameterPixels: number): boolean => diameterPixels >= 26;
export interface BoardGridProps {
  geometry: GridGeometry; board: readonly (readonly number[])[]; label: string; disabled?: boolean; flipRows?: boolean;
  columnInput?: boolean; rouletteColumn?: number | null; rouletteCell?: { row: number; column: number } | null; patternId?: string; viewBox?: string; cellPixels?: number;
  isLegal(row: number, column: number): boolean; onSelect(row: number, column: number): void;
  renderCell(value: number, row: number, column: number, cx: number, cy: number): ComponentChildren;
  selectionLabel(row: number, column: number): string; overlay?(row: number, column: number, cx: number, cy: number): ComponentChildren; footer?(column: number, cx: number, y: number): ComponentChildren;
}
export function gridMetrics(geometry: GridGeometry) {
  return { width: geometry.columns * 100, boardHeight: geometry.rows * 100, height: geometry.rows * 100 + (geometry.footer ?? 0) };
}
export function GridBoard({ geometry, board, label, disabled = false, flipRows = false, columnInput = false, rouletteColumn = null, rouletteCell = null, patternId = 'board-dither', viewBox, cellPixels = 100, isLegal, onSelect, renderCell, selectionLabel, overlay, footer }: BoardGridProps) {
  const { width, boardHeight, height } = gridMetrics(geometry);
  const pixel = 100 / Math.max(1, Math.floor(cellPixels));
  const cells = Array.from({ length: geometry.rows * geometry.columns }, (_, index) => ({ visualRow: Math.floor(index / geometry.columns), column: index % geometry.columns }));
  const select = (row: number, column: number) => !disabled && isLegal(row, column) && onSelect(row, column);
  return <svg class="board" viewBox={viewBox ?? `0 0 ${width} ${height}`} role="grid" aria-label={label} data-layout={geometry.layout} data-grid={`${geometry.columns}x${geometry.rows}`}>
    <defs><pattern id={`${patternId}-dark`} width={pixel * 3} height={pixel * 3} patternUnits="userSpaceOnUse"><rect width={pixel} height={pixel} fill="var(--ink)" /></pattern><pattern id={`${patternId}-light`} width={pixel * 3} height={pixel * 3} patternUnits="userSpaceOnUse"><rect width={pixel} height={pixel} fill="var(--paper)" /></pattern></defs>
    <rect class="board-background" x="2" y="2" width={width - 4} height={boardHeight - 4} rx={geometry.layout === 'slots' ? 24 : 0} stroke-width="4" />
    {geometry.layout !== 'slots' && Array.from({ length: geometry.columns + (geometry.layout === 'cells' ? 1 : 0) }, (_, column) => <line key={`v${column}`} x1={(column + (geometry.layout === 'intersections' ? .5 : 0)) * 100} x2={(column + (geometry.layout === 'intersections' ? .5 : 0)) * 100} y1={geometry.layout === 'cells' ? 0 : 50} y2={geometry.layout === 'cells' ? boardHeight : boardHeight - 50} stroke="var(--line)" stroke-width="3" />)}
    {geometry.layout !== 'slots' && Array.from({ length: geometry.rows + (geometry.layout === 'cells' ? 1 : 0) }, (_, row) => <line key={`h${row}`} y1={(row + (geometry.layout === 'intersections' ? .5 : 0)) * 100} y2={(row + (geometry.layout === 'intersections' ? .5 : 0)) * 100} x1={geometry.layout === 'cells' ? 0 : 50} x2={geometry.layout === 'cells' ? width : width - 50} stroke="var(--line)" stroke-width="3" />)}
    {rouletteColumn !== null && <rect class="roulette-highlight" x={rouletteColumn * 100 + 8} y="8" width="84" height={boardHeight - 16} rx="18" />}
    {rouletteCell && <rect class="roulette-highlight" x={rouletteCell.column * 100 + 8} y={rouletteCell.row * 100 + 8} width="84" height="84" rx="18" />}
    {cells.map(({ visualRow, column }) => { const row = flipRows ? geometry.rows - 1 - visualRow : visualRow; return renderCell(board[row]?.[column] ?? 0, row, column, column * 100 + 50, visualRow * 100 + 50); })}
    {overlay && cells.map(({ visualRow, column }) => { const row = flipRows ? geometry.rows - 1 - visualRow : visualRow; return overlay(row, column, column * 100 + 50, visualRow * 100 + 50); })}
    {(columnInput ? Array.from({ length: geometry.columns }, (_, column) => ({ row: 0, column })) : cells.map(({ visualRow, column }) => ({ row: flipRows ? geometry.rows - 1 - visualRow : visualRow, column }))).map(({ row, column }) => {
      const legal = !disabled && isLegal(row, column), y = columnInput ? 5 : (flipRows ? geometry.rows - 1 - row : row) * 100 + 5;
      return <g key={`${row}:${column}`} role="button" aria-label={selectionLabel(row, column)} aria-disabled={!legal} tabIndex={legal ? 0 : -1} onClick={() => select(row, column)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') select(row, column); }}><rect class="board-hit-area" x={column * 100 + 5} y={y} width="90" height={columnInput ? boardHeight - 10 : 90} /></g>;
    })}
    {footer && Array.from({ length: geometry.columns }, (_, column) => footer(column, column * 100 + 50, boardHeight + (geometry.footer ?? 0) / 2))}
  </svg>;
}
export function Stone({ seat, cx, cy, radius = 40, diameterPixels, patternId = 'board-dither' }: { seat: 1 | 2; cx: number; cy: number; radius?: number; diameterPixels: number; patternId?: string }) {
  const base = seat === 1 ? 'var(--ink)' : 'var(--paper)', offset = seat === 1 ? radius * .14 : -radius * .14;
  return <g aria-label={`${seat}번 돌`}><circle cx={cx} cy={cy} r={radius} fill={base} />{stoneDitherEnabled(diameterPixels) && <><circle cx={cx} cy={cy} r={radius - 1} fill={`url(#${patternId}-${seat === 1 ? 'light' : 'dark'})`} /><circle cx={cx + offset} cy={cy + offset} r={radius * .82} fill={base} /></>}<circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--line)" stroke-width={radius * .115} /></g>;
}
