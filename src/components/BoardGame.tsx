import { legalGameMoves, moveForKey, moveKey, type GameId, type GameMove, type GameMoveKey, type GameState, type GridMove } from '../game/catalog';
import type { SamokState, Seat } from '../game/samok';
import { voteMarks } from '../game/team-vote';
import { Board } from './Board';
import { BOARD_GEOMETRIES, GridBoard, Stone } from './BoardGrid';
interface Props { game: GameId; state: GameState; disabled?: boolean; selfId?: string | null; seat?: Seat | null; rouletteMove?: GameMoveKey | null; onMove(move: GameMove): void }
export function BoardGame({ game, state, disabled = false, selfId = null, seat = null, rouletteMove = null, onMove }: Props) {
  if (game === 'samok') return <Board state={state as SamokState} disabled={disabled} selfId={selfId} seat={seat} rouletteColumn={rouletteMove === null ? null : Number(rouletteMove)} onDrop={onMove} />;
  const legal = new Set(legalGameMoves(game, state).map(moveKey)), diameter = game === 'omok' ? 22 : game === 'yukmok' ? 18 : 44;
  const marks = voteMarks(state, selfId), roulette = rouletteMove === null ? null : moveForKey(game, state, rouletteMove) as GridMove | null;
  return <GridBoard geometry={BOARD_GEOMETRIES[game]} board={state.board} label={`${game} board`} disabled={disabled} cellPixels={diameter + 2} rouletteCell={roulette && 'row' in roulette ? roulette : null}
    isLegal={(row, column) => legal.has(`${row}:${column}`)} onSelect={(row, column) => onMove({ row, column })} selectionLabel={(row, column) => `${row + 1}행 ${column + 1}열에 놓기`}
    renderCell={(cell, row, column, cx, cy) => <g key={`${row}:${column}`} role="gridcell" aria-label={cell ? `${cell}번 돌` : '빈칸'}>{cell ? <Stone seat={cell as Seat} cx={cx} cy={cy} radius={40} diameterPixels={diameter} patternId={`${game}-dither`} /> : null}</g>}
    overlay={(row, column, cx, cy) => { const mark = marks.get(`${row}:${column}`); return mark ? <g key={`vote-${row}:${column}`} class={`vote-marker ${mark.own && seat ? `own-vote player-${seat}` : ''}`} aria-label={`${mark.count}표`}><circle cx={cx} cy={cy} r="18" /><text x={cx} y={cy + 7} text-anchor="middle">{mark.count}</text></g> : null; }} patternId={`${game}-dither`} />;
}
