import type { YachtSessionProjection } from '../game/yacht-session';
import { YACHT_CATEGORIES, type YachtCategory, type YachtTurnAction } from '../game/yacht';

const LABELS: Record<YachtCategory, string> = { ones: '에이스', twos: '듀스', threes: '트레이', fours: '포', fives: '파이브', sixes: '식스', choice: '초이스', 'four-kind': '포 다이스', 'full-house': '풀 하우스', 'small-straight': '스몰 스트레이트', 'large-straight': '라지 스트레이트', yacht: '요트' };

export function yachtScoreCell(used: number | undefined, preview: number | undefined, active: boolean, selected: boolean, previewClass = 'score-preview') {
  const visiblePreview = used === undefined && active ? preview : undefined;
  return { value: used ?? visiblePreview ?? '', className: visiblePreview === undefined ? '' : `${previewClass}${selected ? ' selected' : ''}` };
}

export const yachtColumnClass = (seat: number, current: boolean, self: boolean) => [`player-${seat}`, current ? 'current-turn' : '', self ? 'self-column' : ''].filter(Boolean).join(' ');
export const showYachtSelfMarker = (local: boolean, viewerId: string | null, participantId: string): boolean => !local && viewerId === participantId;
export const YACHT_SCORE_ROWS: readonly (YachtCategory | 'upper-bonus')[] = [...YACHT_CATEGORIES.slice(0, 6), 'upper-bonus', ...YACHT_CATEGORIES.slice(6)];

interface Props {
  view: YachtSessionProjection;
  currentParticipantId: string;
  viewerId: string | null;
  local: boolean;
  canAct: boolean;
  forced: boolean;
  selected: YachtCategory | null;
  onSelect: (category: YachtCategory) => void;
  onAction: (action: YachtTurnAction) => void;
}

export function YachtScoreTable({ view, currentParticipantId, viewerId, local, canAct, forced, selected, onSelect, onAction }: Props) {
  return <><table><thead><tr><th>항목</th>{view.participants.map((participant, index) => {
    const self = showYachtSelfMarker(local, viewerId, participant.id);
    return <th class={yachtColumnClass(index + 1, participant.id === currentParticipantId, self)} aria-current={participant.id === currentParticipantId ? 'true' : undefined} key={participant.id}>{participant.name}{self && <span class="yacht-self-marker">나</span>}</th>;
  })}</tr></thead><tbody>
    {YACHT_SCORE_ROWS.map((category) => category === 'upper-bonus'
      ? <tr key={category}><th>상단 보너스</th>{view.participants.map((participant) => <td key={participant.id}>{participant.scoreCard.upperBonus}</td>)}</tr>
      : <tr key={category}><th>{LABELS[category]}</th>{view.participants.map((participant) => {
        const used = participant.scoreCard.scores[category], active = participant.id === currentParticipantId;
        const cell = yachtScoreCell(used, participant.previews[category], active, selected === category);
        return <td key={participant.id}><button class={cell.className} disabled={!canAct || !forced || !active || used !== undefined} onClick={() => onSelect(category)}>{cell.value}</button></td>;
      })}</tr>)}
    <tr><th>합계</th>{view.participants.map((participant) => <td key={participant.id}>{participant.scoreCard.total}</td>)}</tr>
  </tbody></table><button class="primary yacht-register" disabled={!canAct || !forced || selected === null} onClick={() => selected && onAction({ type: 'register', category: selected })}>등록</button></>;
}
