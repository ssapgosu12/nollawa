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
});

describe('E3: caller-supplied six-sided dice results', () => {
  it('renders at most 6 supplied d6 values on white dice with the matching black pip counts', () => {
    const supplied = [1, 2, 3, 4, 5, 6];
    const rendered = children(DiceResults({ outcomes: supplied, replayKey: 2 }));
    expect(rendered).toHaveLength(6);
    expect(rendered.map((die) => children(die).filter((pip) => pip.props.class === 'die-pip is-on').length)).toEqual(supplied);
    expect(css).toMatch(/\.effect-die\s*{[^}]*background:\s*var\(--paper\)/);
    expect(css).toMatch(/\.die-pip\.is-on\s*{[^}]*background:\s*var\(--ink\)/);
  });
});

describe('E4: full deck-shuffle sequence', () => {
  it('uses the supplied deck name with an overlay, center deck, shuffle/reunion, interlaced exits, caption, and overlay-off phase', () => {
    const overlay = DeckShuffle({ deckName: '테스트 카드', replayKey: 3 });
    expect(overlay.props).toMatchObject({ class: 'deck-shuffle-overlay', role: 'status', 'aria-label': '테스트 카드 덱 섞기' });
    const [deck, caption] = children(overlay);
    expect(children(deck)).toHaveLength(10);
    expect(caption.props.children.join('')).toBe('테스트 카드 덱이 섞이고 있습니다');
    expect(css).toMatch(/@keyframes shuffle-card[\s\S]*var\(--effect-near\)[\s\S]*translate\(-50%, -50%\)[\s\S]*var\(--effect-exit\)/);
    expect(css).toMatch(/@keyframes deck-overlay[\s\S]*100%\s*{[^}]*visibility:\s*hidden/);
    const deckRule = css.match(/\.shuffle-card\s*{[^}]*}/)?.[0] ?? '';
    expect(deckRule).not.toContain('var(--accent)');
    expect(deckRule).toMatch(/var\(--effect-card\)[\s\S]*var\(--ink\)/);
  });
});

describe('E5: manual and automatic coin and dice execution', () => {
  it('provides both launch modes for each effect and removes all motion in reduced-motion mode', () => {
    expect(source.match(/<EffectDemo title="(?:동전 던지기|주사위 굴리기)">/g)).toHaveLength(2);
    expect(source.match(/>던지기!<\/button>/g)).toHaveLength(1);
    expect(source).toMatch(/demoCoinOutcomes\(coinCount, replayKey\)[\s\S]*demoDiceOutcomes\(diceCount, replayKey\)/);
    expect(demoCoinOutcomes(4, 0)).not.toEqual(demoCoinOutcomes(4, 1));
    expect(demoDiceOutcomes(2, 0)).not.toEqual(demoDiceOutcomes(2, 1));
    expect(source).toMatch(/type="checkbox"[\s\S]*자동/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.effect-coin, \.effect-die, \.shuffle-card, \.shuffle-caption, \.deck-shuffle-overlay\s*{\s*animation:\s*none/);
    expect(source).not.toMatch(/#[\da-f]{3,8}\b/i);
  });
});
