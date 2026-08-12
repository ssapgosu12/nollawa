import type { SamokState } from '../game/samok';

const MARKERS = [
  { className: 'player-1', shape: '●', number: '1' },
  { className: 'player-2', shape: '■', number: '2' },
  { className: 'player-3', shape: '▲', number: '3' },
  { className: 'player-4', shape: '◆', number: '4' },
];

interface BoardProps {
  state: SamokState;
  disabled?: boolean;
  onDrop(column: number): void;
}

export function Board({ state, disabled = false, onDrop }: BoardProps) {
  return (
    <svg class="board" viewBox="0 0 700 600" role="grid" aria-label="사목 7열 6행 판">
      <rect class="board-background" x="2" y="2" width="696" height="596" rx="24" stroke-width="4" />
      {Array.from({ length: 7 }, (_, column) => (
        <g
          key={column}
          role="button"
          aria-label={`${column + 1}열에 놓기`}
          aria-disabled={disabled || state.board[5]?.[column] !== 0}
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && onDrop(column)}
          onKeyDown={(event) => {
            if (!disabled && (event.key === 'Enter' || event.key === ' ')) onDrop(column);
          }}
        >
          <rect class="board-hit-area" x={column * 100 + 5} y="5" width="90" height="590" />
          {Array.from({ length: 6 }, (_, visualRow) => {
            const row = 5 - visualRow;
            const cell = state.board[row]?.[column] ?? 0;
            const marker = cell ? MARKERS[cell - 1] : null;
            const cx = column * 100 + 50;
            const cy = visualRow * 100 + 50;
            return (
              <g key={row} role="gridcell" aria-label={cell ? `${cell}번 말` : '빈칸'}>
                <circle class={`board-cell ${marker?.className ?? ''}`} cx={cx} cy={cy} r="40" stroke-width="5" />
                {marker && <text x={cx} y={cy + 3} class="piece-shape" text-anchor="middle">{marker.shape}</text>}
                {marker && <text x={cx + 24} y={cy + 28} class="piece-number" text-anchor="middle">{marker.number}</text>}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
