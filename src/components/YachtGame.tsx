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

interface Props {
  events: readonly YachtInputEvent[];
  actorId: string | null;
  local?: boolean;
  onAction: (action: YachtTurnAction) => void;
  onUndo: () => void;
  onExit: () => void;
  random?: () => number;
}

export function YachtGame({ events, actorId, local = false, onAction, onUndo, onExit, random = Math.random }: Props) {
  const view = yachtProjection(events, actorId ?? undefined), current = view.participants.find(({ id }) => id === view.currentParticipantId)!;
  const [sheetOpen, setSheetOpen] = useState(false), [selected, setSelected] = useState<YachtCategory | null>(null);
  const forced = current.phase !== 'rolling', canAct = actorId === current.id && !view.complete;
  useEffect(() => { if (forced) setSheetOpen(true); setSelected(null); }, [current.id, forced]);
  useEffect(() => typeof navigator !== 'undefined' && typeof document !== 'undefined' ? startYachtWakeLock(navigator as WakeNavigator, document) : undefined, []);
  const roll = () => onAction({ type: 'roll', dice: Array.from({ length: 5 }, () => (Math.floor(random() * 6) + 1) as YachtDie) });
  return <section class="yacht-game" aria-labelledby="yacht-title">
    <header class="yacht-head"><div><p class="eyebrow">{view.complete ? '경기 완료' : `${current.name} 차례 · ${current.rolls}/3회`}</p><h1 id="yacht-title">Yacht Dice</h1></div><button onClick={onExit}>나가기</button></header>
    <div class={`yacht-dice${forced ? ' pinned' : ''}`}>
      {current.dice ? <DiceResults outcomes={current.dice} replayKey={events.filter((event) => event.type === 'input' && event.action.type === 'roll').length} /> : <p>주사위를 굴려 시작하세요.</p>}
      <div class="yacht-holds">{current.dice?.map((die, index) => <button aria-pressed={current.held[index]} class={current.held[index] ? 'selected' : ''} disabled={!canAct || forced} onClick={() => onAction({ type: 'toggle-hold', index })} key={index}>{index + 1}번 {die} · {current.held[index] ? '남김' : '굴림'}</button>)}</div>
      <div class="yacht-roll-actions"><button class="primary" disabled={!canAct || forced} onClick={roll}>{current.rolls ? '다시 굴리기' : '굴리기'}</button><button disabled={!canAct || forced || !current.dice} onClick={() => onAction({ type: 'stop' })}>그만 굴리기</button>{local && <button disabled={events.length < 2} onClick={onUndo}>되돌리기</button>}</div>
    </div>
    {(sheetOpen || forced) && <div class="yacht-sheet" aria-label="점수판"><table><thead><tr><th>항목</th>{view.participants.map((participant) => <th class={`player-${view.participants.indexOf(participant) + 1}`} key={participant.id}>{participant.name}</th>)}</tr></thead><tbody>
      {YACHT_CATEGORIES.map((category) => <tr key={category}><th>{LABELS[category]}</th>{view.participants.map((participant) => { const used = participant.scoreCard.scores[category], active = participant.id === current.id, preview = active && selected === category ? participant.previews[category] : undefined; return <td key={participant.id}><button class={preview !== undefined ? 'score-preview' : ''} disabled={!canAct || !forced || !active || used !== undefined} onClick={() => setSelected(category)}>{used ?? preview ?? '—'}</button></td>; })}</tr>)}
      <tr><th>상단 보너스</th>{view.participants.map((participant) => <td key={participant.id}>{participant.scoreCard.upperBonus}</td>)}</tr><tr><th>합계</th>{view.participants.map((participant) => <td key={participant.id}>{participant.scoreCard.total}</td>)}</tr>
    </tbody></table><button class="primary yacht-register" disabled={!canAct || !forced || selected === null} onClick={() => selected && onAction({ type: 'register', category: selected })}>등록</button></div>}
    <button class="yacht-sheet-handle" aria-expanded={sheetOpen || forced} disabled={forced} onClick={() => setSheetOpen((open) => !open)}>점수판 {sheetOpen || forced ? '내리기' : '올리기'}</button>
  </section>;
}
