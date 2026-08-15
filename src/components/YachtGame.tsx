import { useEffect, useState } from 'preact/hooks';
import { DiceResults } from './Effects';
import { projectYachtSession, type YachtSessionProjection } from '../game/yacht-session';
import { replayYachtEvents, type YachtInputEvent } from '../game/yacht-events';
import { YACHT_CATEGORIES, type YachtCategory, type YachtDie, type YachtTurnAction } from '../game/yacht';

const LABELS: Record<YachtCategory, string> = { ones: '에이스', twos: '듀스', threes: '트레이', fours: '포', fives: '파이브', sixes: '식스', choice: '초이스', 'four-kind': '포 다이스', 'full-house': '풀 하우스', 'small-straight': '스몰 스트레이트', 'large-straight': '라지 스트레이트', yacht: '요트' };
type WakeSentinel = { release(): Promise<void> };
type WakeNavigator = { wakeLock?: { request(type: 'screen'): Promise<WakeSentinel> } };
type VisibilityDocument = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

export function startYachtWakeLock(nav: WakeNavigator, doc: VisibilityDocument): () => void {
  let live = true, sentinel: WakeSentinel | null = null;
  const acquire = async () => { if (!live || doc.visibilityState !== 'visible' || sentinel || !nav.wakeLock) return; try { const next = await nav.wakeLock.request('screen'); if (live) sentinel = next; else void next.release(); } catch { /* unsupported/rejected is non-fatal */ } };
  const visibility = () => { if (doc.visibilityState === 'visible') void acquire(); else { const current = sentinel; sentinel = null; if (current) void current.release().catch(() => undefined); } };
  doc.addEventListener('visibilitychange', visibility); void acquire();
  return () => { live = false; doc.removeEventListener('visibilitychange', visibility); const current = sentinel; sentinel = null; if (current) void current.release().catch(() => undefined); };
}

export const yachtProjection = (events: readonly YachtInputEvent[], viewerId?: string): YachtSessionProjection => projectYachtSession(replayYachtEvents(events), viewerId);

export function yachtScoreCell(used: number | undefined, preview: number | undefined, active: boolean, selected: boolean, previewClass = 'score-preview') {
  const visiblePreview = used === undefined && active ? preview : undefined;
  return { value: used ?? visiblePreview ?? '', className: visiblePreview === undefined ? '' : `${previewClass}${selected ? ' selected' : ''}` };
}

export const yachtColumnClass = (seat: number, current: boolean, self: boolean) => [`player-${seat}`, current ? 'current-turn' : '', self ? 'self-column' : ''].filter(Boolean).join(' ');
export const showYachtSelfMarker = (local: boolean, viewerId: string | null, participantId: string): boolean => !local && viewerId === participantId;
export const YACHT_SCORE_ROWS: readonly (YachtCategory | 'upper-bonus')[] = [...YACHT_CATEGORIES.slice(0, 6), 'upper-bonus', ...YACHT_CATEGORIES.slice(6)];
export type YachtSheetEvent = 'manual-toggle' | 'rolling-continues' | 'rolling-ended' | 'new-rolling-turn' | 'browser-back';
export function nextYachtSheetOpen(open: boolean, event: YachtSheetEvent): boolean {
  if (event === 'manual-toggle') return !open;
  if (event === 'rolling-continues') return open;
  if (event === 'rolling-ended') return true;
  return false;
}

export function deriveYachtDieReplayKeys(events: readonly YachtInputEvent[]): readonly number[] {
  const turnStart = events.reduce((start, event, index) => event.type === 'input' && event.action.type === 'register' ? index + 1 : start, 1);
  const rerollSelected = [false, false, false, false, false], identities = [0, 0, 0, 0, 0];
  let rolled = false;
  events.slice(turnStart).forEach((event, offset) => {
    if (event.type !== 'input') return;
    if (event.action.type === 'toggle-reroll') rerollSelected[event.action.index] = !rerollSelected[event.action.index];
    if (event.action.type === 'roll') {
      identities.forEach((_, index) => { if (!rolled || rerollSelected[index]) identities[index] = turnStart + offset; });
      rerollSelected.fill(false); rolled = true;
    }
  });
  return identities;
}

interface Props {
  events: readonly YachtInputEvent[];
  actorId: string | null;
  viewerId: string | null;
  local?: boolean;
  onAction: (action: YachtTurnAction) => void;
  onUndo: () => void;
  onExit: () => void;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  random?: () => number;
}

export function YachtGame({ events, actorId, viewerId, local = false, onAction, onUndo, onExit, sheetOpen, onSheetOpenChange, random = Math.random }: Props) {
  const view = yachtProjection(events, viewerId ?? undefined), current = view.participants.find(({ id }) => id === view.currentParticipantId)!;
  const [selected, setSelected] = useState<YachtCategory | null>(null);
  const forced = current.phase !== 'rolling', canAct = actorId === current.id && !view.complete;
  const dieReplayKeys = deriveYachtDieReplayKeys(events);
  useEffect(() => { onSheetOpenChange(nextYachtSheetOpen(sheetOpen, forced ? 'rolling-ended' : 'new-rolling-turn')); setSelected(null); }, [current.id, forced]);
  useEffect(() => typeof navigator !== 'undefined' && typeof document !== 'undefined' ? startYachtWakeLock(navigator as WakeNavigator, document) : undefined, []);
  const roll = () => onAction({ type: 'roll', dice: Array.from({ length: 5 }, () => (Math.floor(random() * 6) + 1) as YachtDie) });
  return <section class={`yacht-game${sheetOpen ? ' sheet-active' : ''}`} aria-labelledby="yacht-title">
    <header class="yacht-head"><div><p class="eyebrow">{view.complete ? '경기 완료' : `${current.name} 차례 · ${current.rolls}/3회`}</p><h1 id="yacht-title">Yacht Dice</h1></div><button onClick={onExit}>나가기</button></header>
    <div class={`yacht-dice${forced ? ' pinned' : ''}`}>
      {current.dice ? <DiceResults outcomes={current.dice} replayKey={dieReplayKeys.reduce((latest, identity) => Math.max(latest, identity), 0)} replayKeys={dieReplayKeys} selected={current.rerollSelected} disabled={!canAct || forced} onSelect={(index) => onAction({ type: 'toggle-reroll', index })} /> : <p>주사위를 굴려 시작하세요.</p>}
      <div class="yacht-roll-actions"><button class="primary" disabled={!canAct || forced} onClick={roll}>{current.rolls ? '다시 굴리기' : '굴리기'}</button><button disabled={!canAct || forced || !current.dice} onClick={() => onAction({ type: 'stop' })}>확정!</button>{local && <button disabled={events.length < 2} onClick={onUndo}>되돌리기</button>}</div>
    </div>
    {sheetOpen && <div class="yacht-sheet" aria-label="점수판"><table><thead><tr><th>항목</th>{view.participants.map((participant, index) => { const self = showYachtSelfMarker(local, viewerId, participant.id); return <th class={yachtColumnClass(index + 1, participant.id === current.id, self)} aria-current={participant.id === current.id ? 'true' : undefined} key={participant.id}>{participant.name}{self && <span class="yacht-self-marker">나</span>}</th>; })}</tr></thead><tbody>
      {YACHT_SCORE_ROWS.map((category) => category === 'upper-bonus'
        ? <tr key={category}><th>상단 보너스</th>{view.participants.map((participant) => <td key={participant.id}>{participant.scoreCard.upperBonus}</td>)}</tr>
        : <tr key={category}><th>{LABELS[category]}</th>{view.participants.map((participant) => { const used = participant.scoreCard.scores[category], active = participant.id === current.id, cell = yachtScoreCell(used, participant.previews[category], active, selected === category, 'score-preview'); return <td key={participant.id}><button class={cell.className} disabled={!canAct || !forced || !active || used !== undefined} onClick={() => setSelected(category)}>{cell.value}</button></td>; })}</tr>)}
      <tr><th>합계</th>{view.participants.map((participant) => <td key={participant.id}>{participant.scoreCard.total}</td>)}</tr>
    </tbody></table><button class="primary yacht-register" disabled={!canAct || !forced || selected === null} onClick={() => selected && onAction({ type: 'register', category: selected })}>등록</button></div>}
    <button class="yacht-sheet-handle" aria-expanded={sheetOpen} disabled={forced} onClick={() => onSheetOpenChange(nextYachtSheetOpen(sheetOpen, 'manual-toggle'))}>점수판 {sheetOpen ? '내리기' : '올리기'}</button>
  </section>;
}
