import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export type CoinFace = 'H' | 'T';
export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;

export const demoCoinOutcomes = (count: number, random: () => number = Math.random): CoinFace[] =>
  Array.from({ length: count }, () => random() < .5 ? 'H' : 'T');

export const demoDiceOutcomes = (count: number, random: () => number = Math.random): DieFace[] =>
  Array.from({ length: count }, () => (Math.floor(random() * 6) + 1) as DieFace);

interface ReplayProps { replayKey?: number }
interface CoinResultsProps extends ReplayProps { outcomes: readonly CoinFace[] }
interface DiceResultsProps extends ReplayProps { outcomes: readonly DieFace[] }
interface DeckShuffleProps extends ReplayProps { deckName: string }

const PIPS: Record<DieFace, readonly number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

export function CoinResults({ outcomes, replayKey = 0 }: CoinResultsProps) {
  return <output class="effect-grid coin-results" aria-label="동전 결과" data-replay={replayKey}>
    {outcomes.slice(0, 12).map((face, index) => <span class={`effect-coin face-${face}`} style={`--effect-index:${index}`} aria-label={face === 'H' ? '앞면 H' : '뒷면 T'} key={`${replayKey}-${index}`}>{face}</span>)}
  </output>;
}

export function DiceResults({ outcomes, replayKey = 0 }: DiceResultsProps) {
  return <output class="effect-grid dice-results" aria-label="주사위 결과" data-replay={replayKey}>
    {outcomes.slice(0, 6).map((face, index) => <span class="effect-die" data-value={face} style={`--effect-index:${index}`} aria-label={`주사위 ${face}`} key={`${replayKey}-${index}`}>
      {Array.from({ length: 9 }, (_, pip) => <i class={PIPS[face].includes(pip) ? 'die-pip is-on' : 'die-pip'} style={`--pip-index:${pip}`} aria-hidden="true" />)}
    </span>)}
  </output>;
}

export function DeckShuffle({ deckName, replayKey = 0 }: DeckShuffleProps) {
  return <div class="deck-shuffle-overlay" role="status" aria-label={`${deckName} 덱 섞기`} key={`${deckName}-${replayKey}`}>
    <div class="shuffle-deck" aria-hidden="true">
      <i class="shuffle-piece shuffle-half shuffle-left" />
      <i class="shuffle-piece shuffle-half shuffle-right" />
      <i class="shuffle-piece shuffle-stripe stripe-left" />
      <i class="shuffle-piece shuffle-stripe stripe-right" />
    </div>
    <p class="shuffle-caption">{deckName} 덱이 섞이고 있습니다</p>
  </div>;
}

interface DemoProps { title: string; children: (replayKey: number) => ComponentChildren }
function EffectDemo({ title, children }: DemoProps) {
  const [replayKey, setReplayKey] = useState(0);
  const [automatic, setAutomatic] = useState(false);
  useEffect(() => {
    if (!automatic) return;
    setReplayKey((value) => value + 1);
    const timer = window.setInterval(() => setReplayKey((value) => value + 1), 2_600);
    return () => window.clearInterval(timer);
  }, [automatic]);
  return <article class="effect-demo">
    <h2>{title}</h2>
    {children(replayKey)}
    <div class="effect-controls"><button onClick={() => setReplayKey((value) => value + 1)}>던지기!</button><label><input type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.currentTarget.checked)} /> 자동</label></div>
  </article>;
}

export function EffectsTestPage({ onBack }: { onBack: () => void }) {
  const [coinCount, setCoinCount] = useState(4);
  const [diceCount, setDiceCount] = useState(2);
  const [shuffleKey, setShuffleKey] = useState(0);
  return <section class="panel effects-page" aria-labelledby="effects-title">
    <button onClick={onBack}>게임 목록</button><h1 id="effects-title">연출 테스트</h1>
    <div class="effect-selectors">
      <label>동전 개수<select value={coinCount} onChange={(event) => setCoinCount(Number(event.currentTarget.value))}>{Array.from({ length: 12 }, (_, index) => <option value={index + 1}>{index + 1}</option>)}</select></label>
      <label>주사위 개수<select value={diceCount} onChange={(event) => setDiceCount(Number(event.currentTarget.value))}>{Array.from({ length: 6 }, (_, index) => <option value={index + 1}>{index + 1}</option>)}</select></label>
    </div>
    <EffectDemo title="동전 던지기">{(replayKey) => <CoinResults outcomes={demoCoinOutcomes(coinCount)} replayKey={replayKey} />}</EffectDemo>
    <EffectDemo title="주사위 굴리기">{(replayKey) => <DiceResults outcomes={demoDiceOutcomes(diceCount)} replayKey={replayKey} />}</EffectDemo>
    <article class="effect-demo"><h2>덱 섞기</h2><button onClick={() => setShuffleKey((value) => value + 1)}>덱 섞기</button>{shuffleKey > 0 && <DeckShuffle deckName="Nollawa 카드" replayKey={shuffleKey} />}</article>
  </section>;
}
