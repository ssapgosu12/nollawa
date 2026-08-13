import type { SamokState } from '../game/samok';
import type { Seat } from '../game/samok';
import { voteDots } from '../game/team-vote';
import { BOARD_GEOMETRIES, GridBoard } from './BoardGrid';
const MARKERS = [
  { className: 'player-1', shape: '●', number: '1' },
  { className: 'player-2', shape: '■', number: '2' },
  { className: 'player-3', shape: '▲', number: '3' },
  { className: 'player-4', shape: '◆', number: '4' },
];
interface BoardProps {
  state: SamokState;
  disabled?: boolean;
  selfId?: string | null;
  seat?: Seat | null;
  rouletteColumn?: number | null;
  onDrop(column: number): void;
}
export function Board({ state, disabled = false, selfId = null, seat = null, rouletteColumn = null, onDrop }: BoardProps) {
  const dots = voteDots(state, selfId);
  return <GridBoard geometry={BOARD_GEOMETRIES.samok} viewBox="0 0 700 650" board={state.board} label="사목 7열 6행 판" disabled={disabled} flipRows columnInput rouletteColumn={rouletteColumn}
    isLegal={(_row, column) => state.board[5]?.[column] === 0} onSelect={(_row, column) => onDrop(column)} selectionLabel={(_row, column) => `${column + 1}열에 놓기`}
    renderCell={(cell, row, column, cx, cy) => { const marker = cell ? MARKERS[cell - 1] : null; return <g key={`${row}:${column}`} role="gridcell" aria-label={cell ? `${cell}번 말` : '빈칸'}><circle class={`board-cell ${marker?.className ?? ''}`} cx={cx} cy={cy} r="40" stroke-width="5" />{marker && <text x={cx} y={cy + 3} class="piece-shape" text-anchor="middle">{marker.shape}</text>}{marker && <text x={cx + 24} y={cy + 28} class="piece-number" text-anchor="middle">{marker.number}</text>}</g>; }}
    footer={(column, cx) => <g key={column} aria-label={`${column + 1}열 ${dots[column]?.count ?? 0}표`}>{Array.from({ length: dots[column]?.count ?? 0 }, (_, index) => { const own = Boolean(dots[column]?.own && index === 0); return <circle key={index} class={`vote-dot ${own && seat ? `own-vote player-${seat}` : ''}`} cx={cx + (index - ((dots[column]?.count ?? 1) - 1) / 2) * 20} cy="625" r="8" />; })}</g>} />;
}
