import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

export type CoinFace = 'H' | 'T';
export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;

export const demoCoinOutcomes = (count: number, random: () => number = Math.random): CoinFace[] =>
  Array.from({ length: count }, () => random() < .5 ? 'H' : 'T');

export const demoDiceOutcomes = (count: number, random: () => number = Math.random): DieFace[] =>
  Array.from({ length: count }, () => (Math.floor(random() * 6) + 1) as DieFace);

interface ReplayProps { replayKey?: number }
interface CoinResultsProps extends ReplayProps { outcomes: readonly CoinFace[] }
interface DiceResultsProps extends ReplayProps { outcomes: readonly DieFace[] }
interface DeckShuffleProps extends ReplayProps { deckName: string; settings?: Partial<DeckSettings> }

const PIPS: Record<DieFace, readonly number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

export const DICE_SCRAMBLE_PHASES = [[0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8]] as const;
export const DICE_DWELL_DEFAULT_MS = 220;
const PIP_SCRAMBLE_CLASS = Array.from({ length: 9 }, (_, pip) => `scramble-${DICE_SCRAMBLE_PHASES.map((phase) => phase.includes(pip as never) ? 1 : 0).join('')}`);

export interface DeckSettings {
  cardFallMs: number; cardStaggerMs: number; cardFadeMs: number; spawnWaitMs: number;
  firstSplitMs: number; firstHoldMs: number; repeatSplitMs: number;
  cycleWaitMs: number; joinMs: number; exitMs: number; stackOffsetPct: number; fallStartPct: number;
  cardFollowMs: number; splitPct: number; tiltDeg: number; exitWaitMs: number;
}
export const DECK_DEFAULTS: DeckSettings = {
  cardFallMs: 300, cardStaggerMs: 70, cardFadeMs: 100, spawnWaitMs: 90,
  firstSplitMs: 50, firstHoldMs: 0, repeatSplitMs: 50,
  cycleWaitMs: 0, joinMs: 180, exitMs: 500, stackOffsetPct: 2, fallStartPct: 160,
  cardFollowMs: 20, splitPct: 30, tiltDeg: 20, exitWaitMs: 100,
};
export const DECK_CONTROLS: readonly [keyof DeckSettings, string, number, number][] = [
  ['cardFallMs', '카드 낙하 ms', 50, 800], ['cardStaggerMs', '카드 간격 ms', 0, 250], ['cardFadeMs', '페이드인 ms', 0, 500],
  ['spawnWaitMs', '스폰 후 대기 ms', 0, 800], ['firstSplitMs', '첫 분리 ms', 50, 500],
  ['firstHoldMs', '첫 분리 대기 ms', 0, 500], ['repeatSplitMs', '반복 분리 ms', 50, 500], ['cycleWaitMs', '반복 대기 ms', 0, 500],
  ['joinMs', '합치기 ms', 50, 500], ['exitMs', '소멸 ms', 50, 900], ['stackOffsetPct', '카드 상단 오프셋 %', 0, 10], ['fallStartPct', '낙하 시작 높이 %', 20, 240],
  ['cardFollowMs', '카드 추종 지연 ms', 0, 100], ['splitPct', '벌어짐 %', 0, 60], ['tiltDeg', '기울임 도', 0, 45],
  ['exitWaitMs', '소멸 전 대기 ms', 0, 600],
];
export const deriveDeckTimeline = (s: DeckSettings) => {
  const spawnEnd = s.cardStaggerMs * 7 + s.cardFallMs, shuffleStart = spawnEnd + s.spawnWaitMs;
  const effectiveJoinMs = s.joinMs + s.cardFollowMs * 7;
  const split1 = shuffleStart, join1 = split1 + s.firstSplitMs + s.firstHoldMs;
  const split2 = join1 + effectiveJoinMs + s.cycleWaitMs, join2 = split2 + s.repeatSplitMs + s.cycleWaitMs;
  const split3 = join2 + effectiveJoinMs + s.cycleWaitMs, join3 = split3 + s.repeatSplitMs + s.cycleWaitMs;
  const exitStart = join3 + effectiveJoinMs + s.exitWaitMs;
  return {
    spawnEnd, shuffleStart, splitStarts: [split1, split2, split3] as const,
    splitEnds: [split1 + s.firstSplitMs, split2 + s.repeatSplitMs, split3 + s.repeatSplitMs] as const,
    joinStarts: [join1, join2, join3] as const, joinEnds: [join1 + effectiveJoinMs, join2 + effectiveJoinMs, join3 + effectiveJoinMs] as const,
    directions: ['right', 'left', 'right'] as const, joinMs: s.joinMs, cardFollowMs: s.cardFollowMs, effectiveJoinMs, exitWaitMs: s.exitWaitMs, splitPct: s.splitPct, tiltDeg: s.tiltDeg,
    exitStart, shuffleMs: exitStart - shuffleStart, total: exitStart + s.exitMs,
  };
};

type PileSide = 'left' | 'right';
type CardPile = 'odd' | 'even';
export const CARD_Z_ORDER = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const deriveCardJoinWindows = (timeline: ReturnType<typeof deriveDeckTimeline>, cardOrder: number) =>
  timeline.joinStarts.map((joinStart) => {
    const start = joinStart + (cardOrder - 1) * timeline.cardFollowMs;
    return { start, end: start + timeline.joinMs };
  });
const sideForCycle = (pile: CardPile, cycle: number): PileSide =>
  (pile === 'odd') === (cycle % 2 === 0) ? 'left' : 'right';
export const buildCardTimeline = (name: string, pile: CardPile, cardOrder: number, timeline: ReturnType<typeof deriveDeckTimeline>) => {
  const at = (absoluteMs: number) => `${Number((((absoluteMs - timeline.shuffleStart) / timeline.shuffleMs) * 100).toFixed(4))}%`;
  const split = (cycle: number) => sideForCycle(pile, cycle) === 'right'
    ? `translateX(${timeline.splitPct}%) rotate(${timeline.tiltDeg}deg)`
    : `translateX(-${timeline.splitPct}%) rotate(-${timeline.tiltDeg}deg)`;
  const joinWindows = deriveCardJoinWindows(timeline, cardOrder);
  const frames = ['0% { transform: none; animation-timing-function: cubic-bezier(.2, .75, .3, 1); }'];
  for (const cycle of [0, 1, 2] as const) {
    const joinWindow = joinWindows[cycle]!;
    frames.push(`${at(timeline.splitEnds[cycle])} { transform: ${split(cycle)}; animation-timing-function: linear; }`);
    frames.push(`${at(joinWindow.start)} { transform: ${split(cycle)}; animation-timing-function: cubic-bezier(.2, .75, .3, 1); }`);
    frames.push(`${at(joinWindow.end)} { transform: none; animation-timing-function: linear; }`);
    if (cycle < 2) {
      const nextCycle = cycle === 0 ? 1 : 2;
      frames.push(`${at(timeline.splitStarts[nextCycle])} { transform: none; animation-timing-function: cubic-bezier(.2, .75, .3, 1); }`);
    }
  }
  frames.push('100% { transform: none; visibility: hidden; }');
  return `@keyframes ${name} { ${frames.join(' ')} }`;
};

export function CoinResults({ outcomes, replayKey = 0 }: CoinResultsProps) {
  return <output class="effect-grid coin-results" aria-label="동전 결과" data-replay={replayKey}>
    {outcomes.slice(0, 12).map((face, index) => <span class={`effect-coin face-${face}`} style={`--effect-index:${index}`} aria-label={face === 'H' ? '앞면 H' : '뒷면 T'} key={`${replayKey}-${index}`}>{face}</span>)}
  </output>;
}

export function DiceResults({ outcomes, replayKey = 0 }: DiceResultsProps) {
  return <output class="effect-grid dice-results" aria-label="주사위 결과" data-replay={replayKey}>
    {outcomes.slice(0, 6).map((face, index) => <span class="effect-die" data-value={face} style={`--effect-index:${index}`} aria-label={`주사위 ${face}`} key={`${replayKey}-${index}`}>
      {Array.from({ length: 9 }, (_, pip) => <i class={`die-pip ${PIP_SCRAMBLE_CLASS[pip]}${PIPS[face].includes(pip) ? ' is-on' : ''}`} aria-hidden="true" />)}
    </span>)}
  </output>;
}

export function DeckShuffle({ deckName, replayKey = 0, settings }: DeckShuffleProps) {
  const resolved = { ...DECK_DEFAULTS, ...settings }, timeline = deriveDeckTimeline(resolved);
  const timing = `--fall-ms:${resolved.cardFallMs}ms;--fade-ms:${resolved.cardFadeMs}ms;--shuffle-ms:${timeline.shuffleMs}ms;--exit-ms:${resolved.exitMs}ms;--shuffle-start:${timeline.shuffleStart}ms;--exit-start:${timeline.exitStart}ms;--total-ms:${timeline.total}ms;--fall-start:${resolved.fallStartPct}%`;
  const suffix = Math.abs(Math.trunc(replayKey));
  const cards = Array.from({ length: 8 }, (_, index) => ({ index, order: index + 1, pile: (index + 1) % 2 ? 'odd' : 'even' }));
  return <div class="deck-shuffle-overlay" role="status" aria-label={`${deckName} 덱 섞기`} key={`${deckName}-${replayKey}`} style={timing}>
    <style>{cards.map((card) => buildCardTimeline(`deck-shuffle-card-${suffix}-${card.order}`, card.pile as CardPile, card.order, timeline)).join(' ')}</style>
    <div class="shuffle-scene">
      <div class="shuffle-deck" aria-hidden="true" data-spawn-cards="8" data-shuffle-cards="8">
        {cards.map((card) => <span class="shuffle-card-track" data-card-index={card.order} data-pile={card.pile} data-z-order={CARD_Z_ORDER[card.index]} data-directions={card.pile === 'odd' ? 'left,right,left' : 'right,left,right'} style={`--card-z:${CARD_Z_ORDER[card.index]};animation-name:deck-shuffle-card-${suffix}-${card.order}`} key={card.order}>
          <i class="shuffle-card spawn-card pile-card" style={`--card-delay:${card.index * resolved.cardStaggerMs}ms;--stack-y:${card.index * resolved.stackOffsetPct}%`} />
        </span>)}
        <i class="shuffle-card exit-band exit-left" />
        <i class="shuffle-card exit-band exit-right" />
      </div>
      <p class="shuffle-caption">{deckName} 덱이 섞이고 있습니다</p>
    </div>
  </div>;
}

interface DemoProps { title: string; deps: readonly unknown[]; style?: string; children: (replayKey: number) => ComponentChildren }
function EffectDemo({ title, deps, style, children }: DemoProps) {
  const [replayKey, setReplayKey] = useState(0);
  const [automatic, setAutomatic] = useState(false);
  useEffect(() => {
    if (!automatic) return;
    setReplayKey((value) => value + 1);
    const timer = window.setInterval(() => setReplayKey((value) => value + 1), 2_600);
    return () => window.clearInterval(timer);
  }, [automatic]);
  return <article class="effect-demo" style={style}>
    <h2>{title}</h2>
    {useMemo(() => children(replayKey), [replayKey, ...deps])}
    <div class="effect-controls"><button onClick={() => setReplayKey((value) => value + 1)}>던지기!</button><label><input type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.currentTarget.checked)} /> 자동</label></div>
  </article>;
}

export function EffectsTestPage({ onBack }: { onBack: () => void }) {
  const [coinCount, setCoinCount] = useState(4);
  const [diceCount, setDiceCount] = useState(2);
  const [diceDwellMs, setDiceDwellMs] = useState(DICE_DWELL_DEFAULT_MS);
  const [shuffleKey, setShuffleKey] = useState(0);
  const [deckSettings, setDeckSettings] = useState(DECK_DEFAULTS);
  return <section class="panel effects-page" aria-labelledby="effects-title">
    <button onClick={onBack}>게임 목록</button><h1 id="effects-title">연출 테스트</h1>
    <div class="effect-selectors">
      <label>동전 개수<select value={coinCount} onChange={(event) => setCoinCount(Number(event.currentTarget.value))}>{Array.from({ length: 12 }, (_, index) => <option value={index + 1}>{index + 1}</option>)}</select></label>
      <label>주사위 개수<select value={diceCount} onChange={(event) => setDiceCount(Number(event.currentTarget.value))}>{Array.from({ length: 6 }, (_, index) => <option value={index + 1}>{index + 1}</option>)}</select></label>
      <label>주사위 눈 체류 ms<input type="range" min="160" max="500" step="10" value={diceDwellMs} onInput={(event) => setDiceDwellMs(Number(event.currentTarget.value))} /><output>{diceDwellMs}</output></label>
    </div>
    <EffectDemo title="동전 던지기" deps={[coinCount]}>{(replayKey) => <CoinResults outcomes={demoCoinOutcomes(coinCount)} replayKey={replayKey} />}</EffectDemo>
    <EffectDemo title="주사위 굴리기" deps={[diceCount]} style={`--dice-dwell-ms:${diceDwellMs}ms`}>{(replayKey) => <DiceResults outcomes={demoDiceOutcomes(diceCount)} replayKey={replayKey} />}</EffectDemo>
    <article class="effect-demo"><h2>덱 섞기</h2><div class="deck-timing-controls">{DECK_CONTROLS.map(([key, label, min, max]) => <label>{label}<input type="range" min={min} max={max} value={deckSettings[key]} onInput={(event) => setDeckSettings({ ...deckSettings, [key]: Number(event.currentTarget.value) })} /><output>{deckSettings[key]}</output></label>)}</div><button onClick={() => setShuffleKey((value) => value + 1)}>덱 섞기</button>{shuffleKey > 0 && <DeckShuffle deckName="Nollawa 카드" replayKey={shuffleKey} settings={deckSettings} />}</article>
  </section>;
}
