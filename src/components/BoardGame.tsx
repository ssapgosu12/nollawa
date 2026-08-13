import { legalGameMoves, moveKey, type GameId, type GameMove, type GameState } from '../game/catalog';
import type { SamokState, Seat } from '../game/samok';
import { Board } from './Board';
import { BOARD_GEOMETRIES, GridBoard, Stone } from './BoardGrid';
interface Props { game: GameId; state: GameState; disabled?: boolean; selfId?: string | null; seat?: Seat | null; rouletteColumn?: number | null; onMove(move: GameMove): void }
export function BoardGame({ game, state, disabled = false, selfId = null, seat = null, rouletteColumn = null, onMove }: Props) {
  if (game === 'samok') return <Board state={state as SamokState} disabled={disabled} selfId={selfId} seat={seat} rouletteColumn={rouletteColumn} onDrop={onMove} />;
  const legal = new Set(legalGameMoves(game, state).map(moveKey)), diameter = game === 'omok' ? 22 : game === 'yukmok' ? 18 : 44;
  return <GridBoard geometry={BOARD_GEOMETRIES[game]} board={state.board} label={`${game} board`} disabled={disabled} cellPixels={diameter + 2}
    isLegal={(row, column) => legal.has(`${row}:${column}`)} onSelect={(row, column) => onMove({ row, column })} selectionLabel={(row, column) => `${row + 1}행 ${column + 1}열에 놓기`}
    renderCell={(cell, row, column, cx, cy) => <g key={`${row}:${column}`} role="gridcell" aria-label={cell ? `${cell}번 돌` : '빈칸'}>{cell ? <Stone seat={cell as Seat} cx={cx} cy={cy} radius={40} diameterPixels={diameter} patternId={`${game}-dither`} /> : null}</g>} patternId={`${game}-dither`} />;
}
