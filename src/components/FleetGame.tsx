import { useState } from 'preact/hooks';
import {
  CLASSIC_FLEET_LENGTHS,
  FLEET_BOARD_SIZE,
  projectFleetState,
  type FleetAction,
  type FleetCell,
  type FleetOrientation,
  type FleetParticipantView,
  type FleetShip,
  type FleetState,
} from '../game/fleet';

interface Props {
  state: FleetState;
  viewerId: string | null;
  onAction: (action: FleetAction) => void;
  onExit: () => void;
}

export const FLEET_SHIP_TEXTURE_ROLES = ['body', 'bow', 'stern', 'corner', 'wide-body'] as const;
export const CLASSIC_FLEET_NAMES = ['2칸 함선', '3칸 함선 A', '3칸 함선 B', '4칸 함선', '5칸 함선'] as const;
type FleetShipTextureRole = typeof FLEET_SHIP_TEXTURE_ROLES[number];
type FleetDisplayResult = 'hit' | 'miss' | 'sunk' | 'partial';

export interface FleetTargetPreview {
  targetParticipantId: string;
  cell: FleetCell;
  turnParticipantId: string;
  shotCount: number;
}

const key = ({ row, column }: FleetCell) => `${row}:${column}`;
const sameCell = (left: FleetCell, right: FleetCell) => left.row === right.row && left.column === right.column;

export function canConfirmFleetTarget(state: FleetState, viewerId: string | null, preview: FleetTargetPreview | null): preview is FleetTargetPreview {
  if (!preview || !viewerId || state.phase !== 'targeting' || state.turnParticipantId !== viewerId) return false;
  const target = state.participants.find(({ id }) => id === preview.targetParticipantId);
  return Boolean(target?.alive && target.id !== viewerId && preview.turnParticipantId === state.turnParticipantId
    && preview.shotCount === state.shots.length
    && !state.shots.some((shot) => shot.shooter === viewerId && shot.target === target.id && sameCell(shot.cell, preview.cell)));
}

export function fleetShotMark(result: FleetDisplayResult) {
  const kind = result === 'sunk' ? 'hit' : result;
  return { kind, symbol: '×', label: kind === 'miss' ? '빗나감' : kind === 'partial' ? '부분 파괴' : '명중' };
}

export function fleetShipTexture(ship: FleetShip, cellIndex: number): { role: FleetShipTextureRole; rotation: number } {
  const cell = ship.cells[cellIndex]!, rows = ship.cells.map(({ row }) => row), columns = ship.cells.map(({ column }) => column);
  const minRow = Math.min(...rows), maxRow = Math.max(...rows), minColumn = Math.min(...columns), maxColumn = Math.max(...columns);
  if (minRow !== maxRow && minColumn !== maxColumn) {
    const rowEdge = cell.row === minRow || cell.row === maxRow, columnEdge = cell.column === minColumn || cell.column === maxColumn;
    if (rowEdge && columnEdge) {
      const rotation = cell.row === minRow ? (cell.column === minColumn ? 0 : 90) : (cell.column === maxColumn ? 180 : 270);
      return { role: 'corner', rotation };
    }
    return { role: 'wide-body', rotation: cell.row === minRow ? 0 : 180 };
  }
  const rotation = ship.orientation === 'vertical' ? 90 : 0;
  if (cellIndex === 0) return { role: 'stern', rotation };
  if (cellIndex === ship.cells.length - 1) return { role: 'bow', rotation };
  return { role: 'body', rotation };
}

function FleetBoard({ state, participant, interactive, selectedCell, onCell }: {
  state: FleetState;
  participant: FleetParticipantView | undefined;
  interactive: boolean;
  selectedCell?: FleetCell | null;
  onCell: (cell: FleetCell) => void;
}) {
  const shipCells = new Map(participant?.ships?.flatMap((ship) => ship.cells.map((cell, index) => [key(cell), {
    ship, texture: fleetShipTexture(ship, index), tail: index === ship.cells.length - 1,
  }] as const)) ?? []);
  const shots = new Map<string, FleetDisplayResult>(state.shots.filter(({ target }) => target === participant?.id).map((shot) => [key(shot.cell), shot.result]));
  return <div class="fleet-board" role="grid" aria-label={participant ? `${participant.name}의 보드` : '빈 보드'}>
    {Array.from({ length: FLEET_BOARD_SIZE * FLEET_BOARD_SIZE }, (_, index) => {
      const cell = { row: Math.floor(index / FLEET_BOARD_SIZE), column: index % FLEET_BOARD_SIZE };
      const occupied = shipCells.get(key(cell)), result = shots.get(key(cell)), mark = result ? fleetShotMark(result) : null;
      const selected = Boolean(selectedCell && sameCell(selectedCell, cell));
      return <button type="button" role="gridcell" key={index} disabled={!interactive} aria-selected={selected ? 'true' : undefined}
        class={`fleet-cell${occupied ? ' occupied' : ''}${selected ? ' target-selected' : ''}`} aria-label={`${cell.row + 1}행 ${cell.column + 1}열`} onClick={() => onCell(cell)}>
        {occupied && <span class={`fleet-ship-texture texture-${occupied.texture.role}`} style={{ transform: `rotate(${occupied.texture.rotation}deg)` }} aria-hidden="true" />}
        {mark && <span class={`fleet-shot-mark ${mark.kind}`} aria-label={mark.label}>{mark.symbol}</span>}
        {occupied?.tail && <span class="fleet-ship-label" aria-label={`${CLASSIC_FLEET_NAMES[occupied.ship.index] ?? `${occupied.ship.index + 1}번 함선`}, ${occupied.ship.length}칸`}>{occupied.ship.length}</span>}
      </button>;
    })}
  </div>;
}

export function FleetGame({ state, viewerId, onAction, onExit }: Props) {
  const view = projectFleetState(state, viewerId ?? undefined);
  const own = view.participants.find(({ id }) => id === viewerId);
  const [shipIndex, setShipIndex] = useState(0), [orientation, setOrientation] = useState<FleetOrientation>('horizontal');
  const [targetPreview, setTargetPreview] = useState<FleetTargetPreview | null>(null);
  const target = view.participants.find(({ id }) => id !== viewerId);
  const canPlace = state.phase === 'placement' && state.placementParticipantId === viewerId;
  const canShoot = state.phase === 'targeting' && state.turnParticipantId === viewerId && Boolean(target);
  const confirmableTarget = canConfirmFleetTarget(state, viewerId, targetPreview) ? targetPreview : null;
  const selectedPlaced = own?.ships?.some(({ index }) => index === shipIndex) ?? false;
  const outcome = state.phase === 'complete'
    ? `${view.participants.find(({ id }) => id === state.winnerId)?.name ?? ''} 승리`
    : state.phase === 'placement'
      ? `${view.participants.find(({ id }) => id === state.placementParticipantId)?.name ?? ''} 배치`
      : `${view.participants.find(({ id }) => id === state.turnParticipantId)?.name ?? ''} 사격`;

  return <section class="fleet-screen" aria-label="함대 격침">
    <div class="fleet-zone fleet-upper">
      <div class="fleet-side" aria-hidden="true" />
      <div class="fleet-board-shell">
        {state.phase === 'placement'
          ? <div class="fleet-board fleet-summary"><strong>{outcome}</strong><span>{own?.ships?.length ?? 0}/{CLASSIC_FLEET_LENGTHS.length}척 배치</span><span>일반탄 · 턴당 한 발</span></div>
          : <><span class="fleet-board-name">{target?.name ?? '관전'}</span><FleetBoard state={state} participant={target} interactive={canShoot} selectedCell={confirmableTarget?.cell}
            onCell={(cell) => target && state.turnParticipantId && setTargetPreview({ targetParticipantId: target.id, cell, turnParticipantId: state.turnParticipantId, shotCount: state.shots.length })} /></>}
      </div>
      <div class="fleet-side" aria-hidden="true" />
    </div>
    <div class="fleet-middle">
      {state.phase === 'placement' ? <>
        <div class="fleet-ship-picker" aria-label="배 선택">{CLASSIC_FLEET_LENGTHS.map((length, index) => <button class={shipIndex === index ? 'selected' : ''} aria-pressed={shipIndex === index}
          aria-label={`${CLASSIC_FLEET_NAMES[index]}, ${length}칸`} onClick={() => setShipIndex(index)} key={index}><span>{CLASSIC_FLEET_NAMES[index]}</span><small>{length}칸</small></button>)}</div>
        <button disabled={!canPlace} onClick={() => { if (selectedPlaced) onAction({ type: 'rotate-ship', shipIndex }); else setOrientation((value) => value === 'horizontal' ? 'vertical' : 'horizontal'); }}>회전</button>
        <button class="primary" disabled={!canPlace || own?.ships?.length !== CLASSIC_FLEET_LENGTHS.length} onClick={() => onAction({ type: 'complete-placement' })}>배치 완료</button>
      </> : <><div class="fleet-shot-choice" aria-label="사격 종류"><span aria-checked="true" role="radio">일반 사격</span><span>{outcome}</span></div>
        <button class="primary fleet-confirm-shot" disabled={!confirmableTarget} onClick={() => { if (!confirmableTarget) return; onAction({ type: 'shoot', targetParticipantId: confirmableTarget.targetParticipantId, cell: confirmableTarget.cell, shotType: 'classic' }); setTargetPreview(null); }}>확인</button></>}
      <button class="fleet-exit" onClick={onExit}>나가기</button>
    </div>
    <div class="fleet-zone fleet-lower">
      <div aria-hidden="true" />
      <div class="fleet-lower-center"><p class="fleet-shot-description">일반탄 — 선택한 한 칸을 공격합니다.</p><div class="fleet-board-shell"><span class="fleet-board-name">{own ? `${own.name}의 보드` : '관전자'}</span><FleetBoard state={state} participant={own} interactive={canPlace} onCell={(origin) => onAction({ type: 'place-ship', shipIndex, origin, orientation })} /></div></div>
      <div aria-hidden="true" />
    </div>
  </section>;
}
