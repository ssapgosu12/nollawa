import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_Z_ORDER, CoinResults, DECK_CONTROLS, DECK_DEFAULTS, DICE_DWELL_DEFAULT_MS, DICE_SCRAMBLE_PHASES, DeckShuffle, DiceResults, buildCardTimeline, demoCoinOutcomes, demoDiceOutcomes, deriveCardJoinWindows, deriveDeckTimeline } from './Effects';

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
    expect(css).toMatch(/\.die-pip::before\s*{[^}]*animation-duration:\s*calc\(var\(--dice-dwell-ms, 220ms\) \* 3\)[^}]*animation-delay:\s*calc\(var\(--effect-index\) \* 55ms\)/);
    expect(css).toMatch(/@keyframes die-roll[\s\S]*50%[^{]*{[^}]*translateY\(7px\)[\s\S]*62%[^{]*{[^}]*translateY\(-18px\)[\s\S]*72%[^{]*{[^}]*translateY\(0\)/);
    expect(css).toMatch(/\.die-pip\.is-on\s*{[^}]*animation:\s*die-pip-reveal/);
    expect(css).toMatch(/@keyframes die-pip-reveal\s*{[\s\S]*?0%, 99\.999%[^}]*transparent[\s\S]*?100%[^}]*var\(--ink\)/);
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
    expect(css).toMatch(/@keyframes die-pip-scramble-101[\s\S]*0%, 33\.333%[^{]*{[^}]*opacity:\s*1[\s\S]*33\.334%, 66\.666%[^{]*{[^}]*opacity:\s*0[\s\S]*66\.667%, 99\.999%[^{]*{[^}]*opacity:\s*1/);
    expect(css).toMatch(/@keyframes die-pip-reveal\s*{[\s\S]*100%[^}]*var\(--ink\)/);
  });

  it('E3-DWELL-SLIDER: preserves all three scramble phase sets while lengthening each labeled adjustable dwell', () => {
    expect(DICE_SCRAMBLE_PHASES).toEqual([[0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8]]);
    expect(DICE_DWELL_DEFAULT_MS).toBe(220);
    expect(DICE_DWELL_DEFAULT_MS).toBeGreaterThan(650 * .24);
    expect(source).toMatch(/주사위 눈 체류 ms[\s\S]*type="range"[\s\S]*setDiceDwellMs/);
    expect(source).toMatch(/style=\{`--dice-dwell-ms:\$\{diceDwellMs\}ms`\}/);
    expect(source).toMatch(/title="주사위 굴리기" deps=\{\[diceCount\]\}/);
    expect(css).toMatch(/animation-duration:\s*calc\(var\(--dice-dwell-ms, 220ms\) \* 3\)/);
  });
});

describe('E4: full deck-shuffle sequence', () => {
  const renderedDeck = () => {
    const overlay = DeckShuffle({ deckName: '테스트 카드', replayKey: 3 });
    const [timelineStyle, scene] = children(overlay);
    const [deck, caption] = children(scene);
    const deckChildren = children(deck).flat(Infinity);
    const tracks = deckChildren.filter((node) => node.props.class === 'shuffle-card-track');
    const cards = tracks.map((track) => children(track));
    return { overlay, timelineCss: children(timelineStyle), deck, caption, tracks, cards, deckChildren };
  };

  it('E4-ODD-EVEN-MEMBERSHIP: keeps all 8 spawned whole cards as alternating four-card piles', () => {
    const { overlay, deck, tracks, cards } = renderedDeck();
    expect(overlay.props).toMatchObject({ class: 'deck-shuffle-overlay', role: 'status', 'aria-label': '테스트 카드 덱 섞기' });
    expect(deck.props).toMatchObject({ 'data-spawn-cards': '8', 'data-shuffle-cards': '8' });
    expect(tracks.filter((track) => track.props['data-pile'] === 'odd').map((track) => track.props['data-card-index'])).toEqual([1, 3, 5, 7]);
    expect(tracks.filter((track) => track.props['data-pile'] === 'even').map((track) => track.props['data-card-index'])).toEqual([2, 4, 6, 8]);
    expect(tracks.map((track) => track.props['data-card-index'])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(cards.every((card) => card.props.class === 'shuffle-card spawn-card pile-card')).toBe(true);
  });

  it('E4-CARD-BACK-TEXTURE: gives every pile card monochrome hatching and a centered Nollawa banner without changing its frame', () => {
    const cardRule = css.match(/\.shuffle-card\s*{[^}]*}/)?.[0] ?? '';
    const hatchRule = css.match(/\.pile-card::before\s*{[^}]*}/)?.[0] ?? '';
    const bannerRule = css.match(/\.pile-card::after\s*{[^}]*}/)?.[0] ?? '';
    expect(hatchRule).toMatch(/repeating-linear-gradient\(135deg,[^)]*var\(--ink\)/);
    expect(bannerRule).toMatch(/top:\s*50%[^}]*left:\s*50%[^}]*content:\s*"Nollawa"[^}]*translate\(-50%, -50%\)/);
    expect(cardRule).toMatch(/border:\s*3px solid var\(--line\)/);
    expect(cardRule).toMatch(/border-radius:\s*12px/);
    expect(cardRule).toMatch(/box-shadow:\s*inset 0 0 0 7px var\(--paper\), inset 0 0 0 9px var\(--line\), 0 1px 0 var\(--line\)/);
    expect(`${hatchRule} ${bannerRule}`).toMatch(/var\(--(?:ink|line|paper)\)/);
    expect(`${hatchRule} ${bannerRule}`).not.toMatch(/#[\da-f]{3,8}\b/i);
    expect(css).not.toMatch(/url\s*\(/i);
    expect(source).not.toMatch(/<img\b|\.(?:avif|gif|jpe?g|png|svg|webp)\b/i);
    expect(source).not.toMatch(/#[\da-f]{3,8}\b/i);
  });

  it('E4-CARD-LEVEL-RIPPLE: exposes eight direct sibling z orders and permits only original or adjacent-pair order', () => {
    const { tracks } = renderedDeck();
    const zOrderedCards = tracks.slice().sort((a, b) => a.props['data-z-order'] - b.props['data-z-order']).map((track) => track.props['data-card-index']);
    expect(CARD_Z_ORDER).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(tracks.map((track) => track.props['data-z-order'])).toEqual(CARD_Z_ORDER);
    expect(zOrderedCards.every((card, index) => Math.abs(card - (index + 1)) <= 1)).toBe(true);
    expect(new Set(tracks.map((track) => track.props['data-z-order'])).size).toBe(8);
    expect(source).not.toMatch(/class=\{`shuffle-pile/);
    expect(css).not.toMatch(/\.shuffle-pile\s*{/);
  });

  it('E4-DEFAULTS-TIMELINE-ORDER: preserves the 12 confirmed defaults, adds follow 20 with split/tilt/exit-wait, and derives a 1210ms shuffle', () => {
    expect(DECK_DEFAULTS).toEqual({ cardFallMs: 300, cardStaggerMs: 70, cardFadeMs: 100, spawnWaitMs: 90, firstSplitMs: 50, firstHoldMs: 0, repeatSplitMs: 50, cycleWaitMs: 0, joinMs: 180, exitMs: 500, stackOffsetPct: 2, fallStartPct: 160, cardFollowMs: 20, splitPct: 30, tiltDeg: 20, exitWaitMs: 100 });
    expect(deriveDeckTimeline(DECK_DEFAULTS)).toEqual({ spawnEnd: 790, shuffleStart: 880, splitStarts: [880, 1250, 1620], splitEnds: [930, 1300, 1670], joinStarts: [930, 1300, 1670], joinEnds: [1250, 1620, 1990], directions: ['right', 'left', 'right'], joinMs: 180, cardFollowMs: 20, effectiveJoinMs: 320, exitWaitMs: 100, splitPct: 30, tiltDeg: 20, exitStart: 2090, shuffleMs: 1210, total: 2590 });
  });

  it('E4-CORRECTION-SPAWN-DIRECTION: places each later spawn card above its predecessor at exactly 0 through 14 percent', () => {
    const { tracks } = renderedDeck();
    const spawnStyles = tracks.map((track) => children(track).props.style);
    expect(spawnStyles.map((style) => Number(style.match(/--stack-y:(\d+)%/)?.[1]))).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
  });

  it('E4-GATHER-REMOVED: has no gather phase, timing value, slider, keyframe, or replacement cards', () => {
    const { deckChildren } = renderedDeck();
    expect(source).not.toMatch(/gather|모이기/i);
    expect(css).not.toMatch(/gather/i);
    expect(DECK_CONTROLS.map(([key]) => key)).not.toContain('gatherMs');
    expect(deckChildren.filter((node) => /shuffle-card-[ab]/.test(node.props.class ?? ''))).toHaveLength(0);
  });

  it('E4-ALTERNATING-PILE-SIDES: sends odd/even left-right-left and right-left-right with side-matched tilt', () => {
    const { tracks } = renderedDeck();
    expect(deriveDeckTimeline(DECK_DEFAULTS).directions).toEqual(['right', 'left', 'right']);
    expect(tracks.filter((track) => track.props['data-pile'] === 'odd').every((track) => track.props['data-directions'] === 'left,right,left')).toBe(true);
    expect(tracks.filter((track) => track.props['data-pile'] === 'even').every((track) => track.props['data-directions'] === 'right,left,right')).toBe(true);
    const odd = buildCardTimeline('odd-test', 'odd', 1, deriveDeckTimeline(DECK_DEFAULTS));
    const even = buildCardTimeline('even-test', 'even', 2, deriveDeckTimeline(DECK_DEFAULTS));
    expect(odd.match(/translateX\(-30%\) rotate\(-20deg\)/g)).toHaveLength(4);
    expect(odd.match(/translateX\(30%\) rotate\(20deg\)/g)).toHaveLength(2);
    expect(even.match(/translateX\(30%\) rotate\(20deg\)/g)).toHaveLength(4);
    expect(even.match(/translateX\(-30%\) rotate\(-20deg\)/g)).toHaveLength(2);
    expect(`${odd} ${even}`).not.toMatch(/translateX\(-30%\) rotate\(20deg\)|translateX\(30%\) rotate\(-20deg\)/);
  });

  it('E4-SIMULTANEOUS-30PCT-20DEG: puts exact width-relative translation and rotation in each split endpoint', () => {
    const { timelineCss } = renderedDeck();
    expect(timelineCss).toMatch(/translateX\(30%\) rotate\(20deg\)/);
    expect(timelineCss).toMatch(/translateX\(-30%\) rotate\(-20deg\)/);
    expect(timelineCss).not.toMatch(/translateX\(-30%\) rotate\(20deg\)|translateX\(30%\) rotate\(-20deg\)/);
  });

  it('E4-SINGLE-TIMELINE-NO-OVERLAP: gives each card one computed timeline and keeps all split/join intervals disjoint', () => {
    const timeline = deriveDeckTimeline(DECK_DEFAULTS);
    const intervals = timeline.splitStarts.map((start, index) => [start, timeline.splitEnds[index]]).concat(timeline.joinStarts.map((start, index) => [start, timeline.joinEnds[index]])).sort((a, b) => a[0] - b[0]);
    expect(intervals.every((interval, index) => index === intervals.length - 1 || interval[1] <= intervals[index + 1][0])).toBe(true);
    const { tracks, timelineCss } = renderedDeck();
    expect(tracks.map((track) => track.props.style.match(/animation-name:([^;]+)/)?.[1])).toEqual(Array.from({ length: 8 }, (_, index) => `deck-shuffle-card-3-${index + 1}`));
    expect(timelineCss.match(/@keyframes deck-shuffle-card-3-/g)).toHaveLength(8);
    expect(css.match(/\.shuffle-card-track\s*{[^}]*animation-duration:[^}]*animation-delay:[^}]*animation-fill-mode:[^}]*}/)?.[0]).not.toContain(',');
    expect(css).not.toMatch(/deck-split|deck-join|deck-raise|deck-lower/);
  });

  it('E4-JOIN-FOLLOW-BOTTOM-UP: delays joins only bottom-to-top while retaining the configured movement and simultaneous splits', () => {
    const timeline = deriveDeckTimeline(DECK_DEFAULTS);
    expect(deriveCardJoinWindows(timeline, 1)).toEqual([{ start: 930, end: 1110 }, { start: 1300, end: 1480 }, { start: 1670, end: 1850 }]);
    expect(deriveCardJoinWindows(timeline, 8)).toEqual([{ start: 1070, end: 1250 }, { start: 1440, end: 1620 }, { start: 1810, end: 1990 }]);
    expect(timeline.joinEnds.map((end, index) => end - timeline.joinStarts[index])).toEqual([320, 320, 320]);
    expect(timeline.splitStarts).toEqual([880, 1250, 1620]);
    expect(DECK_CONTROLS).toContainEqual(['cardFollowMs', '카드 추종 지연 ms', 0, 100]);
    expect(DECK_CONTROLS).toContainEqual(['splitPct', '벌어짐 %', 0, 60]);
    expect(DECK_CONTROLS).toContainEqual(['tiltDeg', '기울임 도', 0, 45]);
    expect(DECK_CONTROLS).toContainEqual(['exitWaitMs', '소멸 전 대기 ms', 0, 600]);
  });

  it('E4-NON-OVERSHOOTING-CURVE: keeps the initial-velocity spawn while shuffle cannot cancel displacement by overshooting', () => {
    const right = buildCardTimeline('right-test', 'even', 2, deriveDeckTimeline(DECK_DEFAULTS));
    expect(css).toMatch(/\.spawn-card[^}]*deck-card-spring-drop[^}]*cubic-bezier/);
    expect(right).toMatch(/cubic-bezier\(\.2, \.75, \.3, 1\)/);
    expect(right).not.toMatch(/1\.1[28]/);
    expect(css).toMatch(/\.exit-band[^}]*animation-timing-function:\s*linear/);
    expect(css).toMatch(/@keyframes deck-exit-left[\s\S]*?from\s*{[^}]*opacity:\s*1[\s\S]*?to\s*{[^}]*opacity:\s*0[^}]*translate/);
  });

  it('E4-PRESERVED-LAYOUT-EXIT-INVARIANTS: keeps independent card width, exact caption gap, and 10px linear exit', () => {
    const { caption } = renderedDeck();
    expect(caption.props.children.join('')).toBe('테스트 카드 덱이 섞이고 있습니다');
    expect(css).toMatch(/\.shuffle-scene\s*{[^}]*gap:\s*min\(7\.6vw, 30px\)/);
    expect(css).toMatch(/\.shuffle-deck\s*{[^}]*width:\s*min\(38vw, 150px\)/);
    expect(css.match(/\.shuffle-scene\s*{[^}]*}/)?.[0]).not.toMatch(/gap:\s*20%/);
    expect(css.match(/\.shuffle-caption\s*{[^}]*}/)?.[0]).not.toMatch(/position|bottom/);
    expect(css).toMatch(/\.exit-left\s*{[^}]*repeating-linear-gradient\(to bottom, var\(--ink\) 0 10px, transparent 10px 20px\)/);
    expect(css).toMatch(/\.exit-right\s*{[^}]*repeating-linear-gradient\(to bottom, transparent 0 10px, var\(--ink\) 10px 20px\)/);
    expect(css).toMatch(/\.exit-band\s*{[^}]*animation-timing-function:\s*linear/);
  });

  it('E4-SLIDERS: exposes every remaining specified timing and layout default only on EffectsTestPage', () => {
    expect(DECK_CONTROLS.map(([key]) => key)).toEqual(['cardFallMs', 'cardStaggerMs', 'cardFadeMs', 'spawnWaitMs', 'firstSplitMs', 'firstHoldMs', 'repeatSplitMs', 'cycleWaitMs', 'joinMs', 'exitMs', 'stackOffsetPct', 'fallStartPct', 'cardFollowMs', 'splitPct', 'tiltDeg', 'exitWaitMs']);
    expect(source).toMatch(/DECK_CONTROLS\.map[\s\S]*type="range"[\s\S]*settings={deckSettings}/);
    expect(app).not.toMatch(/DECK_CONTROLS|deck-timing-controls|type="range"/);
  });

  it('E4-EXIT-10PX: exits only after the last join using complementary 10px bands and linear motion', () => {
    const { overlay } = renderedDeck();
    expect(overlay.props.style).toMatch(/--shuffle-ms:1210ms;--exit-ms:500ms;--shuffle-start:880ms;--exit-start:2090ms;--total-ms:2590ms/);
    expect(css).toMatch(/\.exit-left\s*{[^}]*repeating-linear-gradient\(to bottom, var\(--ink\) 0 10px, transparent 10px 20px\)/);
    expect(css).toMatch(/\.exit-right\s*{[^}]*repeating-linear-gradient\(to bottom, transparent 0 10px, var\(--ink\) 10px 20px\)/);
  });

  it('E4-TRIGGER-ONLY: opening the page does not mount or play the deck', () => {
    expect(source).toMatch(/shuffleKey > 0 && <DeckShuffle deckName="Nollawa 카드" replayKey={shuffleKey} settings={deckSettings}/);
    expect(source.match(/<DeckShuffle deckName="Nollawa 카드" replayKey={shuffleKey}/g)).toHaveLength(1);
  });

  it('E4-REDUCED-MOTION: removes pile and card motion while keeping whole joined cards', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.shuffle-card-track, \.shuffle-card[^}]*animation:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.spawn-card\s*{[^}]*opacity:\s*0[\s\S]*\.pile-card\s*{[^}]*opacity:\s*1[\s\S]*\.exit-band\s*{[^}]*display:\s*none/);
  });

  it('E4-NO-JOINED-HALVES: every pile member is a whole card with no clipped half-card borders or seam', () => {
    const { cards } = renderedDeck();
    expect(cards.every((card) => !/half|left|right|stripe/.test(card.props.class))).toBe(true);
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
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.effect-coin, \.effect-die, \.die-pip, \.die-pip::before, \.shuffle-card-track, \.shuffle-card, \.shuffle-caption\s*{\s*animation:\s*none/);
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

describe('D-025 후속: 덱 크기는 자막 폭에 끌려가지 않는다', () => {
  it('E4-DECK-WIDTH-INDEPENDENT: 덱은 자기 폭을 직접 갖고 자막이 트랙을 부풀리지 못한다', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    const deck = css.match(/\.shuffle-deck \{[^}]*\}/)?.[0] ?? '';
    const scene = css.match(/\.shuffle-scene \{[^}]*\}/)?.[0] ?? '';
    expect(deck).toMatch(/width:\s*min\(38vw,\s*150px\)/);
    expect(deck).not.toMatch(/width:\s*100%/);
    expect(scene).not.toMatch(/display:\s*grid/);
  });
});
