import type { SamokState } from '../game/samok';

const MARKERS = [
  { fill: '#f2c94c', shape: '●', number: '1' },
  { fill: '#56a8e8', shape: '■', number: '2' },
  { fill: '#ef767a', shape: '▲', number: '3' },
  { fill: '#65b96e', shape: '◆', number: '4' },
];

interface BoardProps {
  state: SamokState;
  disabled?: boolean;
  onDrop(column: number): void;
}

export function Board({ state, disabled = false, onDrop }: BoardProps) {
  return (
    <svg class="board" viewBox="0 0 700 600" role="grid" aria-label="사목 7열 6행 판">
      <rect x="2" y="2" width="696" height="596" rx="24" fill="#f7f7f3" stroke="#111" stroke-width="4" />
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
          <rect x={column * 100 + 5} y="5" width="90" height="590" fill="transparent" />
          {Array.from({ length: 6 }, (_, visualRow) => {
            const row = 5 - visualRow;
            const cell = state.board[row]?.[column] ?? 0;
            const marker = cell ? MARKERS[cell - 1] : null;
            const cx = column * 100 + 50;
            const cy = visualRow * 100 + 50;
            return (
              <g key={row} role="gridcell" aria-label={cell ? `${cell}번 말` : '빈칸'}>
                <circle cx={cx} cy={cy} r="40" fill={marker?.fill ?? '#fff'} stroke="#111" stroke-width="5" />
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
