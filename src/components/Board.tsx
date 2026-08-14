import type { GridMove } from '../game/catalog';
import type { SamokState, Seat } from '../game/samok';
import { voteDots } from '../game/team-vote';
import { BOARD_GEOMETRIES, GridBoard, LastTurnMarker } from './BoardGrid';
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
  rouletteColumn?: number | null; previewColumn?: number | null; lastTurn?: readonly GridMove[];
  onDrop(column: number): void;
}
export function Board({ state, disabled = false, selfId = null, seat = null, rouletteColumn = null, previewColumn = null, lastTurn = [], onDrop }: BoardProps) {
  const dots = voteDots(state, selfId), previewRow = previewColumn === null ? -1 : state.board.findIndex((row) => row[previewColumn] === 0), last = new Set(lastTurn.map(({ row, column }) => `${row}:${column}`));
  return <GridBoard geometry={BOARD_GEOMETRIES.samok} viewBox="0 0 700 650" board={state.board} label="사목 7열 6행 판" disabled={disabled} flipRows columnInput rouletteColumn={rouletteColumn}
    isLegal={(_row, column) => state.board[5]?.[column] === 0} onSelect={(_row, column) => onDrop(column)} selectionLabel={(_row, column) => `${column + 1}열에 놓기`}
    renderCell={(cell, row, column, cx, cy) => { const preview = !cell && row === previewRow && column === previewColumn, marker = cell ? MARKERS[cell - 1] : preview ? MARKERS[state.turn - 1] : null; return <g key={`${row}:${column}`} role="gridcell" aria-label={cell ? `${cell}번 말` : preview ? '미리보기 말' : '빈칸'}><circle class={`board-cell ${marker?.className ?? ''} ${preview ? 'move-preview' : ''}`} cx={cx} cy={cy} r="40" stroke-width="5" />{marker && <text x={cx} y={cy + 3} class={`piece-shape ${preview ? 'move-preview' : ''}`} text-anchor="middle">{marker.shape}</text>}{marker && <text x={cx + 24} y={cy + 28} class={`piece-number ${preview ? 'move-preview' : ''}`} text-anchor="middle">{marker.number}</text>}</g>; }}
    overlay={(row, column, cx, cy) => last.has(`${row}:${column}`) ? <LastTurnMarker cx={cx} cy={cy} /> : null} footer={(column, cx) => <g key={column} aria-label={`${column + 1}열 ${dots[column]?.count ?? 0}표`}>{Array.from({ length: dots[column]?.count ?? 0 }, (_, index) => { const own = Boolean(dots[column]?.own && index === 0); return <circle key={index} class={`vote-dot ${own && seat ? `own-vote player-${seat}` : ''}`} cx={cx + (index - ((dots[column]?.count ?? 1) - 1) / 2) * 20} cy="625" r="8" />; })}</g>} />;
}
