import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CoinResults, DeckShuffle, DiceResults, demoCoinOutcomes, demoDiceOutcomes } from './Effects';

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
    expect(rendered.map((die) => children(die).filter((pip) => pip.props.class === 'die-pip is-on').length)).toEqual(supplied);
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

  it('hides final pips through the landing and bounce while a separate pip scramble changes', () => {
    expect(css).toMatch(/@keyframes die-roll[\s\S]*50%[^{]*{[^}]*translateY\(7px\)[\s\S]*62%[^{]*{[^}]*translateY\(-18px\)[\s\S]*72%[^{]*{[^}]*translateY\(0\)/);
    expect(css).toMatch(/\.die-pip\.is-on\s*{[^}]*animation:\s*die-pip-reveal/);
    expect(css).toMatch(/@keyframes die-pip-reveal\s*{[\s\S]*?0%, 72%[^}]*transparent[\s\S]*?73%, 100%[^}]*var\(--ink\)/);
    expect(css).toMatch(/\.die-pip::before\s*{[^}]*animation:\s*die-pip-scramble-a/);
    expect(css.match(/@keyframes die-pip-scramble-[abc]/g)).toHaveLength(3);
  });
});

describe('E4: full deck-shuffle sequence', () => {
  it('starts as one assembled deck and runs multiple contiguous split/rejoin phases without card drops or pauses', () => {
    const overlay = DeckShuffle({ deckName: '테스트 카드', replayKey: 3 });
    expect(overlay.props).toMatchObject({ class: 'deck-shuffle-overlay', role: 'status', 'aria-label': '테스트 카드 덱 섞기' });
    const [deck, caption] = children(overlay);
    expect(children(deck).map((piece) => piece.props.class)).toEqual([
      'shuffle-piece shuffle-half shuffle-left', 'shuffle-piece shuffle-half shuffle-right',
      'shuffle-piece shuffle-stripe stripe-left', 'shuffle-piece shuffle-stripe stripe-right',
    ]);
    expect(caption.props.children.join('')).toBe('테스트 카드 덱이 섞이고 있습니다');
    expect(css).toMatch(/@keyframes shuffle-halves[\s\S]*14%[^{]*{[^}]*translate\(-50%, -50%\)[\s\S]*22%[^{]*{[^}]*var\(--shuffle-split\)[\s\S]*30%[^{]*{[^}]*translate\(-50%, -50%\)[\s\S]*38%[^{]*{[^}]*var\(--shuffle-split\)[\s\S]*46%[^{]*{[^}]*translate\(-50%, -50%\)[\s\S]*54%[^{]*{[^}]*var\(--shuffle-split\)[\s\S]*62%[^{]*{[^}]*translate\(-50%, -50%\)/);
    expect(css).not.toMatch(/shuffle-(?:piece|half)[^}]*animation-delay|translate\([^)]*-75vh/);
    expect(css).toMatch(/@keyframes deck-overlay[\s\S]*100%\s*{[^}]*visibility:\s*hidden/);
  });

  it('exits as complementary interlaced bands grouped in exact 10px units', () => {
    expect(css).toMatch(/\.stripe-left\s*{[^}]*repeating-linear-gradient\(to bottom, var\(--ink\) 0 10px, transparent 10px 20px\)/);
    expect(css).toMatch(/\.stripe-right\s*{[^}]*repeating-linear-gradient\(to bottom, transparent 0 10px, var\(--ink\) 10px 20px\)/);
    expect(css).toMatch(/@keyframes shuffle-stripes[\s\S]*67%[^{]*{[^}]*translate\(-50%, -50%\)[\s\S]*100%[^{]*{[^}]*var\(--stripe-exit\)/);
  });

  it('mounts the deck overlay only after its caller advances the trigger key', () => {
    expect(source).toMatch(/shuffleKey > 0 && <DeckShuffle deckName="Nollawa 카드" replayKey={shuffleKey}/);
    expect(source.match(/<DeckShuffle deckName="Nollawa 카드" replayKey={shuffleKey} \/>/g)).toHaveLength(1);
  });
});

describe('E5: manual and automatic coin and dice execution', () => {
  it('provides both launch modes for each effect and removes all motion in reduced-motion mode', () => {
    expect(source.match(/<EffectDemo title="(?:동전 던지기|주사위 굴리기)">/g)).toHaveLength(2);
    expect(source.match(/>던지기!<\/button>/g)).toHaveLength(1);
    expect(source).toMatch(/demoCoinOutcomes\(coinCount\)[\s\S]*demoDiceOutcomes\(diceCount\)/);
    expect(source).toMatch(/type="checkbox"[\s\S]*자동/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.effect-coin, \.effect-die, \.die-pip, \.die-pip::before, \.shuffle-piece, \.shuffle-caption\s*{\s*animation:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.die-pip::before\s*{\s*display:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.die-pip\.is-on\s*{\s*background:\s*var\(--ink\)/);
    expect(source).not.toMatch(/#[\da-f]{3,8}\b/i);
  });
});
