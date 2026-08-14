import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CoinResults, DECK_CONTROLS, DECK_DEFAULTS, DICE_SCRAMBLE_PHASES, DeckShuffle, DiceResults, demoCoinOutcomes, demoDiceOutcomes, deriveDeckTimeline } from './Effects';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const source = readFileSync(new URL('./Effects.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const children = (node) => node.props.children;

describe('E1: effects test page entry and count selectors', () => {
  it('is distinguishable in the game list, opens a dedicated screen, and exposes 1-12 coin and 1-6 dice selectors', () => {
    expect(app).toMatch(/class="game-card effects-entry"[\s\S]*연출 테스트[\s\S]*setScreen\('effects'\)/);
    expect(app).toMatch(/screen === 'effects'[\s\S]*<EffectsTestPage/);
    expect(source).toMatch(/동전 개수[\s\S]*length: 12/);
    expect(source).toMatch(/주사위 개수[\s\S]*length: 6/);
  });
});

describe('E2: caller-supplied H/T coin results', () => {
  it('renders at most 12 supplied outcomes as visible H/T faces without choosing a result', () => {
    const supplied = Array.from({ length: 13 }, (_, index) => index % 2 ? 'T' : 'H');
    const rendered = children(CoinResults({ outcomes: supplied, replayKey: 4 }));
    expect(rendered).toHaveLength(12);
    expect(rendered.map((coin) => coin.props.children)).toEqual(supplied.slice(0, 12));
    expect(css).toMatch(/\.effect-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit/);
  });

  it('uses caller-side injected entropy instead of an H/T modulo pattern', () => {
    const samples = [.1, .8, .2, .9];
    let calls = 0;
    expect(demoCoinOutcomes(4, () => samples[calls++])).toEqual(['H', 'T', 'H', 'T']);
    expect(calls).toBe(4);
    expect(source.match(/export function CoinResults[\s\S]*?\n}/)?.[0]).not.toMatch(/Math\.random|demoCoinOutcomes/);
  });
});

describe('E3: caller-supplied six-sided dice results', () => {
  it('renders at most 6 supplied d6 values on white dice with the matching black pip counts', () => {
    const supplied = [1, 2, 3, 4, 5, 6];
    const rendered = children(DiceResults({ outcomes: supplied, replayKey: 2 }));
    expect(rendered).toHaveLength(6);
    expect(rendered.map((die) => children(die).filter((pip) => pip.props.class.endsWith(' is-on')).length)).toEqual(supplied);
    expect(css).toMatch(/\.effect-die\s*{[^}]*background:\s*var\(--paper\)/);
    expect(css).toMatch(/\.die-pip\.is-on\s*{[^}]*animation:\s*die-pip-reveal/);
  });

  it('uses caller-side injected entropy instead of a 1-6 modulo cycle', () => {
    const samples = [0, .2, .4, .6, .8, .999];
    let calls = 0;
    expect(demoDiceOutcomes(6, () => samples[calls++])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(calls).toBe(6);
    expect(source.match(/export function DiceResults[\s\S]*?\n}/)?.[0]).not.toMatch(/Math\.random|demoDiceOutcomes/);
  });

  it('E3-BOUNCE-DELAY: synchronizes all 6 dice bodies, final pip reveals, and scrambles to the inherited per-die delay', () => {
    const rendered = children(DiceResults({ outcomes: [1, 2, 3, 4, 5, 6], replayKey: 4 }));
    expect(rendered.map((die) => die.props.style)).toEqual(Array.from({ length: 6 }, (_, index) => `--effect-index:${index}`));
    expect(css).toMatch(/\.effect-coin, \.effect-die\s*{[^}]*animation-delay:\s*calc\(var\(--effect-index\) \* 55ms\)/);
    expect(css).toMatch(/\.die-pip\.is-on\s*{[^}]*animation-delay:\s*calc\(var\(--effect-index\) \* 55ms\)/);
    expect(css).toMatch(/\.die-pip::before\s*{[^}]*animation-duration:\s*650ms[^}]*animation-delay:\s*calc\(var\(--effect-index\) \* 55ms\)/);
    expect(css).toMatch(/@keyframes die-roll[\s\S]*50%[^{]*{[^}]*translateY\(7px\)[\s\S]*62%[^{]*{[^}]*translateY\(-18px\)[\s\S]*72%[^{]*{[^}]*translateY\(0\)/);
    expect(css).toMatch(/\.die-pip\.is-on\s*{[^}]*animation:\s*die-pip-reveal/);
    expect(css).toMatch(/@keyframes die-pip-reveal\s*{[\s\S]*?0%, 72%[^}]*transparent[\s\S]*?73%, 100%[^}]*var\(--ink\)/);
    expect(css.match(/@keyframes die-pip-scramble-(?:111|011|101)/g)).toHaveLength(3);
  });

  it('E3-REGRESSION-D024-DISTRIBUTED-PHASE-SETS: inspects actual selectors and rejects every complete 3x3 column', () => {
    const columns = [[0, 3, 6], [1, 4, 7], [2, 5, 8]];
    expect(DICE_SCRAMBLE_PHASES).toEqual([[0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8]]);
    expect(DICE_SCRAMBLE_PHASES.every((phase) => columns.every((column) => !column.every((pip) => phase.includes(pip))))).toBe(true);
    const die = children(DiceResults({ outcomes: [6], replayKey: 9 }))[0];
    expect(children(die).map((pip) => pip.props.class)).toEqual([
      'die-pip scramble-111 is-on', 'die-pip scramble-000', 'die-pip scramble-011 is-on',
      'die-pip scramble-000 is-on', 'die-pip scramble-101', 'die-pip scramble-000 is-on',
      'die-pip scramble-011 is-on', 'die-pip scramble-000', 'die-pip scramble-111 is-on',
    ]);
    expect(css).not.toMatch(/nth-child\(3n/);
    expect(source).toMatch(/PIP_SCRAMBLE_CLASS\[pip\]/);
    expect(css.match(/\.die-pip\.scramble-(?:111|011|101)::before/g)).toHaveLength(3);
    expect(css).toMatch(/@keyframes die-pip-scramble-101[\s\S]*0%, 23%[^{]*{[^}]*opacity:\s*1[\s\S]*24%, 47%[^{]*{[^}]*opacity:\s*0[\s\S]*48%, 72%[^{]*{[^}]*opacity:\s*1/);
    expect(css).toMatch(/@keyframes die-pip-reveal\s*{[\s\S]*73%, 100%[^}]*var\(--ink\)/);
  });
});

describe('E4: full deck-shuffle sequence', () => {
  const renderedDeck = () => {
    const overlay = DeckShuffle({ deckName: '테스트 카드', replayKey: 3 });
    const scene = children(overlay);
    const [deck, caption] = children(scene);
    return { overlay, deck, caption, cards: children(deck).flat(Infinity) };
  };

  it('E4-STAGE-COUNTS: renders exactly 8 whole spawn cards then 2 whole shuffle cards', () => {
    const { overlay, deck, cards } = renderedDeck();
    expect(overlay.props).toMatchObject({ class: 'deck-shuffle-overlay', role: 'status', 'aria-label': '테스트 카드 덱 섞기' });
    expect(deck.props).toMatchObject({ 'data-spawn-cards': '8', 'data-shuffle-cards': '2' });
    expect(cards.filter((card) => card.props.class === 'shuffle-card spawn-card')).toHaveLength(8);
    expect(cards.filter((card) => /shuffle-card-[ab]$/.test(card.props.class))).toHaveLength(2);
  });

  it('E4-DEFAULTS-TIMELINE-ORDER: preserves all exact defaults and derives the 2670ms ordered timeline', () => {
    expect(DECK_DEFAULTS).toEqual({ cardFallMs: 300, cardStaggerMs: 70, cardFadeMs: 150, spawnWaitMs: 300, gatherMs: 150, firstSplitMs: 150, firstHoldMs: 100, repeatSplitMs: 100, cycleWaitMs: 70, joinMs: 100, exitMs: 400, stackOffsetPct: 2, fallStartPct: 120 });
    expect(deriveDeckTimeline(DECK_DEFAULTS)).toEqual({ spawnEnd: 790, gatherStart: 1090, shuffleStart: 1240, splitStarts: [1240, 1660, 2000], joinStarts: [1490, 1830, 2170], directions: ['right', 'left', 'right'], exitStart: 2270, total: 2670 });
  });

  it('E4-CORRECTION-SPAWN-DIRECTION: places each later spawn card above its predecessor at exactly 0 through 14 percent', () => {
    const { cards } = renderedDeck();
    const spawnStyles = cards.filter((card) => card.props.class === 'shuffle-card spawn-card').map((card) => card.props.style);
    expect(spawnStyles.map((style) => Number(style.match(/--stack-y:(\d+)%/)?.[1]))).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
  });

  it('E4-CORRECTION-FOURTH-FROM-BOTTOM-GATHER: gathers all eight cards at the zero-based fourth position of 6 percent', () => {
    const { cards } = renderedDeck();
    const spawnStyles = cards.filter((card) => card.props.class === 'shuffle-card spawn-card').map((card) => card.props.style);
    expect(spawnStyles.map((style) => Number(style.match(/--gather-y:(\d+)%/)?.[1]))).toEqual(Array(8).fill(6));
  });

  it('E4-ALTERNATING-TOP: records the top-card direction as right-left-right and switches z-order per cycle', () => {
    const { cards } = renderedDeck();
    expect(deriveDeckTimeline(DECK_DEFAULTS).directions).toEqual(['right', 'left', 'right']);
    expect(cards.find((card) => card.props.class === 'shuffle-card shuffle-card-a').props['data-top-cycles']).toBe('right,right');
    expect(cards.find((card) => card.props.class === 'shuffle-card shuffle-card-b').props['data-top-cycles']).toBe('left');
    expect(css).toMatch(/\.shuffle-card-a[^}]*deck-lower[^}]*--split-2-start[^}]*deck-raise[^}]*--split-3-start/);
    expect(css).toMatch(/\.shuffle-card-b[^}]*deck-raise[^}]*--split-2-start[^}]*deck-lower[^}]*--split-3-start/);
  });

  it('E4-SIMULTANEOUS-TRANSFORM: moves 30% and rotates 20deg in the same split keyframes', () => {
    expect(css).toMatch(/@keyframes deck-split-right[\s\S]*?to\s*{[^}]*translate\(calc\(-50% \+ 30%\), -50%\) rotate\(20deg\)/);
    expect(css).toMatch(/@keyframes deck-split-left[\s\S]*?to\s*{[^}]*translate\(calc\(-50% - 30%\), -50%\) rotate\(-20deg\)/);
  });

  it('E4-CURVES: uses initial-velocity spring drop and spring shuffle while exit motion and fade stay linear', () => {
    expect(css).toMatch(/\.spawn-card[^}]*deck-card-spring-drop[^}]*cubic-bezier/);
    expect(css).toMatch(/\.shuffle-card-a[^}]*deck-split-right[^}]*cubic-bezier[^}]*deck-join-right[^}]*cubic-bezier/);
    expect(css).toMatch(/\.exit-band[^}]*animation-timing-function:\s*linear/);
    expect(css).toMatch(/@keyframes deck-exit-left[\s\S]*?from\s*{[^}]*opacity:\s*1[\s\S]*?to\s*{[^}]*opacity:\s*0[^}]*translate/);
  });

  it('E4-CORRECTION-CARD-WIDTH-CAPTION-GAP: puts the caption directly below the deck at exactly 20% of card width', () => {
    const { caption } = renderedDeck();
    expect(caption.props.children.join('')).toBe('테스트 카드 덱이 섞이고 있습니다');
    expect(css).toMatch(/\.shuffle-scene\s*{[^}]*width:\s*min\(38vw, 150px\)[^}]*gap:\s*min\(7\.6vw, 30px\)/);
    expect(css.match(/\.shuffle-scene\s*{[^}]*}/)?.[0]).not.toMatch(/gap:\s*20%/);
    expect(css.match(/\.shuffle-caption\s*{[^}]*}/)?.[0]).not.toMatch(/position|bottom/);
  });

  it('E4-SLIDERS: exposes every specified ms and all four proposed defaults only on EffectsTestPage', () => {
    expect(DECK_CONTROLS.map(([key]) => key)).toEqual(['cardFallMs', 'cardStaggerMs', 'cardFadeMs', 'spawnWaitMs', 'gatherMs', 'firstSplitMs', 'firstHoldMs', 'repeatSplitMs', 'cycleWaitMs', 'joinMs', 'exitMs', 'stackOffsetPct', 'fallStartPct']);
    expect(source).toMatch(/DECK_CONTROLS\.map[\s\S]*type="range"[\s\S]*settings={deckSettings}/);
    expect(app).not.toMatch(/DECK_CONTROLS|deck-timing-controls|type="range"/);
  });

  it('E4-EXIT-10PX: exits only after the last join using complementary 10px bands and linear motion', () => {
    const { overlay } = renderedDeck();
    expect(overlay.props.style).toMatch(/--join-3-start:2170ms;--exit-start:2270ms/);
    expect(css).toMatch(/\.exit-left\s*{[^}]*repeating-linear-gradient\(to bottom, var\(--ink\) 0 10px, transparent 10px 20px\)/);
    expect(css).toMatch(/\.exit-right\s*{[^}]*repeating-linear-gradient\(to bottom, transparent 0 10px, var\(--ink\) 10px 20px\)/);
  });

  it('E4-TRIGGER-ONLY: opening the page does not mount or play the deck', () => {
    expect(source).toMatch(/shuffleKey > 0 && <DeckShuffle deckName="Nollawa 카드" replayKey={shuffleKey} settings={deckSettings}/);
    expect(source.match(/<DeckShuffle deckName="Nollawa 카드" replayKey={shuffleKey}/g)).toHaveLength(1);
  });

  it('E4-REDUCED-MOTION: removes all card motion and shows only whole joined cards', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.shuffle-card[^}]*animation:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.spawn-card\s*{[^}]*opacity:\s*0[\s\S]*\.shuffle-card-a, \.shuffle-card-b\s*{[^}]*opacity:\s*1[\s\S]*\.exit-band\s*{[^}]*display:\s*none/);
  });

  it('E4-NO-JOINED-HALVES: joined states are whole cards with no clipped half-card borders or seam', () => {
    const { cards } = renderedDeck();
    expect(cards.filter((card) => /shuffle-card-[ab]$/.test(card.props.class)).every((card) => !/half|left|right|stripe/.test(card.props.class))).toBe(true);
    expect(css).not.toMatch(/clip-path|shuffle-half|shuffle-piece/);
    expect(css.match(/\.shuffle-card\s*{[^}]*}/)?.[0]).toMatch(/border:\s*3px solid[^}]*background:\s*var\(--effect-card\)/);
  });
});

describe('E5: manual and automatic coin and dice execution', () => {
  it('provides both launch modes for each effect and removes all motion in reduced-motion mode', () => {
    expect(source.match(/<EffectDemo title="(?:동전 던지기|주사위 굴리기)"[^>]*>/g)).toHaveLength(2);
    expect(source.match(/>던지기!<\/button>/g)).toHaveLength(1);
    expect(source).toMatch(/demoCoinOutcomes\(coinCount\)[\s\S]*demoDiceOutcomes\(diceCount\)/);
    expect(source).toMatch(/type="checkbox"[\s\S]*자동/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.effect-coin, \.effect-die, \.die-pip, \.die-pip::before, \.shuffle-card, \.shuffle-caption\s*{\s*animation:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.die-pip::before\s*{\s*display:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.die-pip\.is-on\s*{\s*background:\s*var\(--ink\)/);
    expect(source).not.toMatch(/#[\da-f]{3,8}\b/i);
  });
});

describe('D-015 후속: 값은 던질 때만 바뀐다', () => {
  it('E2/E3-PIN: 던지기와 개수 변경 외의 재렌더에서는 결과를 다시 뽑지 않는다', () => {
    const source = readFileSync(new URL('./Effects.tsx', import.meta.url), 'utf8');
    const demo = source.match(/function EffectDemo[\s\S]*?\n}/)?.[0] ?? '';
    expect(demo).toMatch(/useMemo\(\(\) => children\(replayKey\), \[replayKey, \.\.\.deps\]\)/);
    expect(source).toMatch(/deps=\{\[coinCount\]\}/);
    expect(source).toMatch(/deps=\{\[diceCount\]\}/);
  });
});
