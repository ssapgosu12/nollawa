import { useState } from 'preact/hooks';
import {
  CLASSIC_FLEET_LENGTHS,
  FLEET_BOARD_SIZE,
  projectFleetState,
  type FleetAction,
  type FleetCell,
  type FleetOrientation,
  type FleetParticipantView,
  type FleetState,
} from '../game/fleet';

interface Props {
  state: FleetState;
  viewerId: string | null;
  onAction: (action: FleetAction) => void;
  onExit: () => void;
}

const key = ({ row, column }: FleetCell) => `${row}:${column}`;

function FleetBoard({ state, participant, interactive, onCell }: {
  state: FleetState;
  participant: FleetParticipantView | undefined;
  interactive: boolean;
  onCell: (cell: FleetCell) => void;
}) {
  const shipCells = new Map(participant?.ships?.flatMap((ship) => ship.cells.map((cell, index) => [key(cell), { ship, tail: index === ship.cells.length - 1 }] as const)) ?? []);
  const shots = new Map(state.shots.filter(({ target }) => target === participant?.id).map((shot) => [key(shot.cell), shot.result]));
  return <div class="fleet-board" role="grid" aria-label={participant ? `${participant.name}의 보드` : '빈 보드'}>
    {Array.from({ length: FLEET_BOARD_SIZE * FLEET_BOARD_SIZE }, (_, index) => {
      const cell = { row: Math.floor(index / FLEET_BOARD_SIZE), column: index % FLEET_BOARD_SIZE };
      const occupied = shipCells.get(key(cell)), result = shots.get(key(cell));
      return <button type="button" role="gridcell" key={index} disabled={!interactive} class={`fleet-cell${occupied ? ' occupied' : ''}${result ? ` ${result}` : ''}`} aria-label={`${cell.row + 1}행 ${cell.column + 1}열`} onClick={() => onCell(cell)}>
        {result === 'miss' ? '·' : result ? '×' : ''}{occupied?.tail && <span class="fleet-ship-label">{occupied.ship.length}</span>}
      </button>;
    })}
  </div>;
}

export function FleetGame({ state, viewerId, onAction, onExit }: Props) {
  const view = projectFleetState(state, viewerId ?? undefined);
  const own = view.participants.find(({ id }) => id === viewerId);
  const [shipIndex, setShipIndex] = useState(0), [orientation, setOrientation] = useState<FleetOrientation>('horizontal');
  const target = view.participants.find(({ id }) => id !== viewerId);
  const canPlace = state.phase === 'placement' && state.placementParticipantId === viewerId;
  const canShoot = state.phase === 'targeting' && state.turnParticipantId === viewerId && Boolean(target);
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
          : <><span class="fleet-board-name">{target?.name ?? '관전'}</span><FleetBoard state={state} participant={target} interactive={canShoot} onCell={(cell) => target && onAction({ type: 'shoot', targetParticipantId: target.id, cell, shotType: 'classic' })} /></>}
      </div>
      <div class="fleet-side" aria-hidden="true" />
    </div>
    <div class="fleet-middle">
      {state.phase === 'placement' ? <>
        <div class="fleet-ship-picker" aria-label="배 선택">{CLASSIC_FLEET_LENGTHS.map((length, index) => <button class={shipIndex === index ? 'selected' : ''} aria-pressed={shipIndex === index} onClick={() => setShipIndex(index)} key={index}>{length}칸</button>)}</div>
        <button disabled={!canPlace} onClick={() => { if (selectedPlaced) onAction({ type: 'rotate-ship', shipIndex }); else setOrientation((value) => value === 'horizontal' ? 'vertical' : 'horizontal'); }}>회전</button>
        <button class="primary" disabled={!canPlace || own?.ships?.length !== CLASSIC_FLEET_LENGTHS.length} onClick={() => onAction({ type: 'complete-placement' })}>배치 완료</button>
      </> : <div class="fleet-shot-choice" aria-label="사격 종류"><span aria-checked="true" role="radio">일반 사격</span><span>{outcome}</span></div>}
      <button class="fleet-exit" onClick={onExit}>나가기</button>
    </div>
    <div class="fleet-zone fleet-lower">
      <div aria-hidden="true" />
      <div class="fleet-lower-center"><p class="fleet-shot-description">일반탄 — 선택한 한 칸을 공격합니다.</p><div class="fleet-board-shell"><span class="fleet-board-name">{own ? `${own.name}의 보드` : '관전자'}</span><FleetBoard state={state} participant={own} interactive={canPlace} onCell={(origin) => onAction({ type: 'place-ship', shipIndex, origin, orientation })} /></div></div>
      <div aria-hidden="true" />
    </div>
  </section>;
}
