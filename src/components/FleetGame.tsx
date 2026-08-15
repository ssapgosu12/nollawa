import { useEffect, useState } from 'preact/hooks';
import {
  CLASSIC_FLEET_LENGTHS,
  fleetVariantAbilitiesForOwner,
  projectFleetState,
  type FleetAction,
  type FleetCell,
  type FleetOrientation,
  type FleetParticipantView,
  type FleetShip,
  type FleetShootingCard,
  type FleetSpecialShipType,
  type FleetState,
} from '../game/fleet';
import type { FleetShotPlan } from '../game/fleet-shots';

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

export function fleetVariantPlanForCell(card: FleetShootingCard, cell: FleetCell, state: FleetState, targetId = '', random: () => number = Math.random, chosen: readonly FleetCell[] = [], spread = false, actorId = state.turnParticipantId ?? ''): FleetShotPlan {
  if (card === 'salvo') { const turnInCycle = ((state.round ?? 1) - 1) % 3, start = (state.round ?? 1) - turnInCycle; return { type: 'salvo', turnInCycle: turnInCycle as 0 | 1 | 2, previousTurnShotCounts: Array.from({ length: turnInCycle }, (_, index) => state.shots.filter((shot) => shot.shooter === actorId && shot.shotType === 'salvo' && shot.round === start + index).length), cells: [cell] }; }
  if (card === 'flare') return { type: 'flare', normalCell: chosen[0]!, flareCells: [chosen[1]!, chosen[2]!] };
  if (card === 'tracer') return { type: 'tracer', center: cell };
  if (card === 'high-explosive') return { type: 'explosive', boardSize: state.boardSize, turnIndex: (state.round ?? 1) - 1, center: cell };
  if (card === 'scatter') return { type: 'scatter', boardSize: state.boardSize, turnIndex: (state.round ?? 1) - 1, center: cell };
  if (card === 'piercing') return { type: 'piercing', cells: [chosen[0]!, chosen[1]!] };
  if (card === 'random-shot') {
    const alreadyHitCells = state.shots.filter(({ target, result, impactKind }) => target === targetId && result !== 'miss' && impactKind !== 'flare').map(({ cell: hit }) => hit);
    const available = Array.from({ length: state.boardSize * state.boardSize }, (_, index) => ({ row: Math.floor(index / state.boardSize), column: index % state.boardSize })).filter((candidate) => !alreadyHitCells.some((hit) => sameCell(hit, candidate)));
    const count = 1 + Math.floor(Math.min(Math.max(random(), 0), .999999) * 2), randomCells: FleetCell[] = [];
    while (randomCells.length < count && available.length > 0) randomCells.push(available.splice(Math.floor(Math.min(Math.max(random(), 0), .999999) * available.length), 1)[0]!);
    return { type: 'random', normalCell: cell, randomCells, alreadyHitCells };
  }
  if (!spread) return { type: 'buckshot', boardSize: state.boardSize, choice: 'normal', cell };
  const pick = (distance: number) => Array.from({ length: 5 ** 2 }, (_, index) => ({ row: cell.row + Math.floor(index / 5) - 2, column: cell.column + index % 5 - 2 })).filter((candidate) => Math.max(Math.abs(candidate.row - cell.row), Math.abs(candidate.column - cell.column)) === distance).sort(() => random() - .5).slice(0, 3) as [FleetCell, FleetCell, FleetCell];
  return { type: 'buckshot', boardSize: state.boardSize, choice: 'buckshot', center: cell, centerCells: [...pick(0), ...pick(1)].slice(0, 3) as [FleetCell, FleetCell, FleetCell], outerCells: pick(2) };
}

function FleetBoard({ state, participant, interactive, selectedCell, selectedCells = [], invalidTag, onCell }: {
  state: FleetState;
  participant: FleetParticipantView | undefined;
  interactive: boolean;
  selectedCell?: FleetCell | null;
  selectedCells?: readonly FleetCell[];
  invalidTag?: 'coastal' | 'ocean' | null;
  onCell: (cell: FleetCell) => void;
}) {
  const shipCells = new Map(participant?.ships?.flatMap((ship) => ship.cells.map((cell, index) => [key(cell), {
    ship, texture: fleetShipTexture(ship, index), tail: index === ship.cells.length - 1,
  }] as const)) ?? []);
  const shots = new Map<string, FleetDisplayResult>(state.shots.filter(({ target }) => target === participant?.id).map((shot) => [key(shot.cell), shot.result]));
  return <div class={`fleet-board${invalidTag ? ` invalid-zone-flash tag-${invalidTag}` : ''}`} style={`--fleet-board-size:${state.boardSize}`} role="grid" aria-label={participant ? `${participant.name}의 보드` : '빈 보드'}>
    {Array.from({ length: state.boardSize * state.boardSize }, (_, index) => {
      const cell = { row: Math.floor(index / state.boardSize), column: index % state.boardSize };
      const occupied = shipCells.get(key(cell)), result = shots.get(key(cell)), mark = result ? fleetShotMark(result) : null;
      const selected = Boolean((selectedCell && sameCell(selectedCell, cell)) || selectedCells.some((candidate) => sameCell(candidate, cell)));
      const margin = state.boardSize === 10 ? 2 : 3, invalid = invalidTag === 'coastal'
        ? cell.row >= 2 && cell.column >= 2 && cell.row < state.boardSize - 2 && cell.column < state.boardSize - 2
        : invalidTag === 'ocean' ? cell.row < margin || cell.column < margin || cell.row >= state.boardSize - margin || cell.column >= state.boardSize - margin : false;
      return <button type="button" role="gridcell" key={index} disabled={!interactive} aria-selected={selected ? 'true' : undefined}
        class={`fleet-cell${occupied ? ' occupied' : ''}${selected ? ' target-selected' : ''}${invalid ? ' invalid-placement-zone' : ''}`} aria-label={`${cell.row + 1}행 ${cell.column + 1}열`} onClick={() => onCell(cell)}>
        {occupied && <span class={`fleet-ship-texture texture-${occupied.texture.role}`} style={{ transform: `rotate(${occupied.texture.rotation}deg)` }} aria-hidden="true" />}
        {mark && <span class={`fleet-shot-mark ${mark.kind}`} aria-label={mark.label}>{mark.symbol}</span>}
        {occupied?.tail && <span class="fleet-ship-label" aria-label={`${CLASSIC_FLEET_NAMES[occupied.ship.index] ?? `${occupied.ship.index + 1}번 함선`}, ${occupied.ship.length}칸`}>{occupied.ship.placementTag === 'coastal' ? '연안' : occupied.ship.placementTag === 'ocean' ? '원양' : occupied.ship.length}</span>}
      </button>;
    })}
  </div>;
}

export function FleetGame({ state, viewerId, onAction, onExit }: Props) {
  const view = projectFleetState(state, viewerId ?? undefined);
  const own = view.participants.find(({ id }) => id === viewerId);
  const [shipIndex, setShipIndex] = useState(0), [orientation, setOrientation] = useState<FleetOrientation>('horizontal');
  const [targetPreview, setTargetPreview] = useState<FleetTargetPreview | null>(null);
  const [presentationIndex, setPresentationIndex] = useState(0);
  const [targetId, setTargetId] = useState<string | null>(null), [specialSelection, setSpecialSelection] = useState<FleetSpecialShipType[]>([]);
  const [variantCells, setVariantCells] = useState<FleetCell[]>([]), [spread, setSpread] = useState(false);
  const [bonusMode, setBonusMode] = useState<null | 'carrier' | 'tracer' | 'pressure' | 'spy'>(null);
  const targets = view.participants.filter(({ id }) => id !== viewerId), target = targets.find(({ id }) => id === targetId) ?? targets[0];
  const variant = state.mode === 'variant', setup = own?.variantSetup, variantFleet = setup?.fleet ?? [];
  const fleetLengths = variant ? variantFleet.map(({ shape }) => shape.rows * shape.columns) : CLASSIC_FLEET_LENGTHS;
  const canPlace = state.phase === 'placement' && state.placementParticipantId === viewerId;
  const submitted = (state.roundPlans ?? []).some(({ participantId, submitted: done }) => participantId === viewerId && done);
  const canShoot = state.phase === 'targeting' && Boolean(target?.alive) && (variant ? Boolean(own?.alive) && !submitted : state.turnParticipantId === viewerId);
  const selectionNeeded = !bonusMode && setup?.shootingCard === 'flare' ? 3 : !bonusMode && setup?.shootingCard === 'piercing' ? 2 : 0;
  const confirmableTarget = variant ? canShoot && variantCells.length >= selectionNeeded ? targetPreview : null : canConfirmFleetTarget(state, viewerId, targetPreview) ? targetPreview : null;
  const selectedPlaced = own?.ships?.some(({ index }) => index === shipIndex) ?? false;
  const draft = state.roundPlans?.find(({ participantId }) => participantId === viewerId), selectedImpacts = draft?.impacts.filter(({ targetParticipantId }) => targetParticipantId === target?.id).map(({ cell }) => cell) ?? [];
  const carousel = variant && state.participants.length >= 3;
  const abilities = viewerId ? fleetVariantAbilitiesForOwner(state, viewerId) : null;
  useEffect(() => setPresentationIndex(0), [state.presentationQueue]);
  useEffect(() => {
    if (presentationIndex >= (state.presentationQueue?.length ?? 0)) return;
    const timer = window.setTimeout(() => setPresentationIndex((index) => index + 1), 900);
    return () => window.clearTimeout(timer);
  }, [state.presentationQueue, presentationIndex]);
  const moveTarget = (offset: number) => { const index = Math.max(0, targets.findIndex(({ id }) => id === target?.id)); setTargetId(targets[(index + offset + targets.length) % targets.length]?.id ?? null); setTargetPreview(null); };
  const selectTarget = (cell: FleetCell) => { if (selectionNeeded) setVariantCells((current) => current.length < selectionNeeded ? [...current, cell] : current); };
  const shiftRange = (row: number, column: number) => setTargetPreview((current) => current && ({ ...current, cell: { row: Math.max(-2, Math.min(state.boardSize + 1, current.cell.row + row)), column: Math.max(-2, Math.min(state.boardSize + 1, current.cell.column + column)) } }));
  const confirmTarget = () => {
    if (!confirmableTarget) return;
    if (!variant || !setup?.shootingCard) onAction({ type: 'shoot', targetParticipantId: confirmableTarget.targetParticipantId, cell: confirmableTarget.cell, shotType: 'classic' });
    else if (bonusMode === 'spy') onAction({ type: 'scout-variant-cell', targetParticipantId: confirmableTarget.targetParticipantId, cell: confirmableTarget.cell });
    else {
      const plan: FleetShotPlan = bonusMode === 'carrier' ? { type: 'normal', cell: confirmableTarget.cell }
        : bonusMode === 'tracer' ? { type: 'tracer', center: confirmableTarget.cell }
          : bonusMode === 'pressure' ? { type: 'explosive', boardSize: state.boardSize, turnIndex: (state.round ?? 1) - 1, center: confirmableTarget.cell }
            : fleetVariantPlanForCell(setup.shootingCard, confirmableTarget.cell, state, confirmableTarget.targetParticipantId, Math.random, variantCells, spread, viewerId ?? '');
      onAction({ type: 'queue-variant-shot', targetParticipantId: confirmableTarget.targetParticipantId, plan });
    }
    setTargetPreview(null); setVariantCells([]); setBonusMode(null);
  };
  const outcome = state.phase === 'complete'
    ? state.draw ? '무승부' : `${view.participants.find(({ id }) => id === state.winnerId)?.name ?? ''} 승리`
    : state.phase === 'placement'
      ? `${view.participants.find(({ id }) => id === state.placementParticipantId)?.name ?? ''} 배치`
      : variant ? `${state.round ?? 1}라운드 · ${(state.roundPlans ?? []).filter(({ submitted: done }) => done).length}/${state.participants.filter(({ alive }) => alive).length} 확정` : `${view.participants.find(({ id }) => id === state.turnParticipantId)?.name ?? ''} 사격`;

  if (state.phase === 'setup') {
    const active = state.setupParticipantId === viewerId, preset = setup?.presetOffers.find(({ id }) => id === setup.selectedPresetId), choiceCount = state.participants.length === 2 ? 1 : 2;
    return <section class="fleet-screen fleet-variant-setup" aria-label="함대 격침 변형 설정"><div class="fleet-zone fleet-upper"><div class="fleet-side setup-side" /><div class="fleet-board fleet-summary"><strong>{own?.name ?? '참가자'} 프리셋</strong>{setup?.presetOffers.map((offer) => <button disabled={!active || Boolean(preset)} onClick={() => onAction({ type: 'choose-variant-preset', presetId: offer.id })} key={offer.id}>{offer.shootingCard} · 특수 배 {offer.specialShipOffers.length}종</button>)}</div><div class="fleet-side setup-side" /></div><div class="fleet-middle">{preset?.specialShipOffers.map((kind) => <button class={specialSelection.includes(kind) ? 'selected' : ''} disabled={!active} onClick={() => setSpecialSelection((current) => current.includes(kind) ? current.filter((item) => item !== kind) : current.length < choiceCount ? [...current, kind] : current)} key={kind}>{kind}</button>)}{preset && <button class="primary" disabled={!active || specialSelection.length !== choiceCount} onClick={() => onAction({ type: 'choose-special-ships', specialShips: specialSelection })}>프리셋 확정</button>}<button class="fleet-exit" onClick={onExit}>나가기</button></div><div class="fleet-zone fleet-lower"><div /><div class="fleet-summary"><span>사격 카드 3장 중 1장</span><span>특수 배 {choiceCount}척 선택</span></div><div /></div></section>;
  }

  return <section class="fleet-screen" aria-label="함대 격침">
    <div class="fleet-zone fleet-upper">
      {carousel ? <div class="fleet-side fleet-carousel"><button aria-label="이전 플레이어 보드" onClick={() => moveTarget(-1)}>‹</button></div> : <div class="fleet-side" aria-hidden="true" />}
      <div class="fleet-board-shell">
        {state.phase === 'placement'
          ? <div class="fleet-board fleet-summary"><strong>{outcome}</strong><span>{own?.ships?.length ?? 0}/{fleetLengths.length}척 배치</span><span>{variant ? `${setup?.shootingCard ?? ''} · 동시 입력` : '일반탄 · 턴당 한 발'}</span></div>
          : <><span class="fleet-board-name">{target?.name ?? '관전'}{target?.alive === false ? ' · 탈락' : ''}</span><FleetBoard state={state} participant={target} interactive={canShoot} selectedCell={confirmableTarget?.cell} selectedCells={[...selectedImpacts, ...variantCells]}
            onCell={(cell) => target && setTargetPreview((selectTarget(cell), { targetParticipantId: target.id, cell, turnParticipantId: state.turnParticipantId ?? viewerId ?? '', shotCount: state.shots.length }))} /></>}
      </div>
      {carousel ? <div class="fleet-side fleet-carousel"><button aria-label="다음 플레이어 보드" onClick={() => moveTarget(1)}>›</button></div> : <div class="fleet-side" aria-hidden="true" />}
    </div>
    <div class="fleet-middle">
      {state.phase === 'placement' ? <>
        <div class="fleet-ship-picker" aria-label="배 선택">{variant ? fleetLengths.map((length, index) => <button class={shipIndex === index ? 'selected' : ''} aria-pressed={shipIndex === index} aria-label={`${variantFleet[index]?.id ?? `${index + 1}번 함선`}, ${length}칸`} onClick={() => setShipIndex(index)} key={index}><span>{variantFleet[index]?.id}</span><small>{variantFleet[index]?.placementTag === 'coastal' ? '연안' : variantFleet[index]?.placementTag === 'ocean' ? '원양' : `${length}칸`}</small></button>) : CLASSIC_FLEET_LENGTHS.map((length, index) => <button class={shipIndex === index ? 'selected' : ''} aria-pressed={shipIndex === index}
          aria-label={`${CLASSIC_FLEET_NAMES[index]}, ${length}칸`} onClick={() => setShipIndex(index)} key={index}><span>{CLASSIC_FLEET_NAMES[index]}</span><small>{length}칸</small></button>)}</div>
        <button disabled={!canPlace} onClick={() => { if (selectedPlaced) onAction({ type: 'rotate-ship', shipIndex }); else setOrientation((value) => value === 'horizontal' ? 'vertical' : 'horizontal'); }}>회전</button>
        <button class="primary" disabled={!canPlace || own?.ships?.length !== fleetLengths.length} onClick={() => onAction({ type: 'complete-placement' })}>배치 완료</button>
      </> : <><div class="fleet-shot-choice" aria-label="사격 종류"><span aria-checked="true" role="radio">{bonusMode ?? setup?.shootingCard ?? '일반 사격'}</span><span>{outcome}</span></div>
        {variant && <>{setup?.shootingCard === 'buckshot' && <button class={spread ? 'selected' : ''} onClick={() => setSpread((value) => !value)}>{spread ? '산탄 6발' : '일반탄 대체'}</button>}{abilities?.carrierExtraShots ? <button onClick={() => setBonusMode('carrier')}>항모 추가탄</button> : null}{abilities?.tracerShots ? <button onClick={() => setBonusMode('tracer')}>추가 예광탄</button> : null}{abilities?.privateScouts ? <button onClick={() => setBonusMode('spy')}>비공개 정찰</button> : null}{abilities?.glassCannonPressure && (state.round ?? 1) % 2 === 0 ? <button onClick={() => setBonusMode('pressure')}>압박 고폭탄</button> : null}</>}
        {variant && !bonusMode && (setup?.shootingCard === 'high-explosive' || setup?.shootingCard === 'scatter' || setup?.shootingCard === 'buckshot' && spread) && <div aria-label="판 밖 범위 중심"><button onClick={() => shiftRange(-1, 0)}>↑</button><button onClick={() => shiftRange(1, 0)}>↓</button><button onClick={() => shiftRange(0, -1)}>←</button><button onClick={() => shiftRange(0, 1)}>→</button></div>}
        <button class="primary fleet-confirm-shot" disabled={!confirmableTarget} onClick={confirmTarget}>확인</button>
        {variant && <><button disabled={!draft || draft.submitted} onClick={() => { onAction({ type: 'reset-variant-plan' }); setVariantCells([]); }}>모든 발 회수</button><button class="primary" disabled={!draft || draft.submitted || !draft.uses?.some(({ kind }) => kind === 'card')} onClick={() => onAction({ type: 'submit-variant-plan' })}>사격 확정</button></>}</>}
      <button class="fleet-exit" onClick={onExit}>나가기</button>
    </div>
    <div class="fleet-zone fleet-lower">
      <div aria-hidden="true" />
      <div class="fleet-lower-center"><p class="fleet-shot-description">{variant ? `${setup?.shootingCard ?? ''} — 여러 적 보드에 사격을 배치하고 함께 확정합니다.` : '일반탄 — 선택한 한 칸을 공격합니다.'}</p><div class="fleet-board-shell"><span class="fleet-board-name">{own ? `${own.name}의 보드` : '관전자'}</span><FleetBoard state={state} participant={own} interactive={canPlace} invalidTag={canPlace ? variantFleet[shipIndex]?.placementTag : null} onCell={(origin) => onAction({ type: 'place-ship', shipIndex, origin, orientation })} /></div></div>
      <div aria-hidden="true" />
    </div>
    {variant && state.presentationQueue?.[presentationIndex] && <div class="fleet-presentation" aria-live="polite"><p class="shuffle-caption" key={`${state.round}:${presentationIndex}`}>{state.presentationQueue[presentationIndex]!.text}</p></div>}
  </section>;
}
