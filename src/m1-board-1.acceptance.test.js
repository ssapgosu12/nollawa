import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { canConfirmMovePreview, confirmedActionFor, createMovePreview, playStatusFor, voteRulesForGame } from './App';
import { BoardGame, nextLastTurnView } from './components/BoardGame';
import { LastTurnMarker } from './components/BoardGrid';
import { actionForMove, initGame, legalGameMoves, moveKey, reduceGame } from './game/catalog';
import { reduceAuthorityVote } from './game/team-vote';

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const emptyLast = (game) => ({ game, moves: 0, cells: [] });
const descendants = (node) => node == null ? [] : Array.isArray(node) ? node.flatMap(descendants) : typeof node === 'object' ? [node, ...descendants(node.props?.children)] : [];

describe('S9 two-stage move preview and explicit Confirm', () => {
  it('selection and keyboard callback only move the preview; Confirm chooses the existing local/AI or remote action', () => {
    const game = 'omok', state = initGame(game), [first, second] = legalGameMoves(game, state), selected = vi.fn();
    const board = BoardGame({ game, state, onSelect: selected });
    const svg = board.type(board.props), target = descendants(svg).find((node) => node.props?.role === 'button' && node.props?.['aria-disabled'] === false);
    target.props.onClick();
    target.props.onKeyDown({ key: 'Enter' });
    target.props.onKeyDown({ key: ' ' });
    expect(selected).toHaveBeenCalledTimes(3);
    expect(state.moves).toBe(0);
    expect(appSource).toMatch(/onSelect=\{\(move\) => setPreview/);
    const firstPreview = BoardGame({ game, state, preview: first, onSelect: selected }).props.renderCell(0, first.row, first.column, 50, 50);
    const movedPreview = BoardGame({ game, state, preview: second, onSelect: selected }).props.renderCell(0, second.row, second.column, 50, 50);
    const oldTarget = BoardGame({ game, state, preview: second, onSelect: selected }).props.renderCell(0, first.row, first.column, 50, 50);
    expect(firstPreview.props.class).toBe('move-preview');
    expect(movedPreview.props['aria-label']).toBe('미리보기 돌');
    expect(oldTarget.props['aria-label']).toBe('빈칸');
    expect(confirmedActionFor('remote', game, second)).toEqual({ type: 'vote', move: moveKey(second) });
    expect(confirmedActionFor('local', game, second)).toEqual(actionForMove(game, second));
    expect(confirmedActionFor('ai', game, second)).toEqual(actionForMove(game, second));
    expect(appSource).toContain('>확인</button>');
  });

  it('stale, disabled, occupied, terminal-path, and unresolved-roulette previews cannot confirm', () => {
    const game = 'samok', state = initGame(game), preview = createMovePreview(game, state, 0);
    expect(canConfirmMovePreview(game, state, preview, false)).toBe(true);
    expect(canConfirmMovePreview(game, state, preview, true)).toBe(false);
    const changed = reduceGame(game, state, actionForMove(game, 0));
    expect(canConfirmMovePreview(game, changed, preview, false)).toBe(false);
    expect(canConfirmMovePreview('omok', initGame('omok'), preview, false)).toBe(false);
    expect(appSource).toContain('Boolean(state.resolvedVote)');
  });

  it('remote re-Confirm changes the vote through reduceAuthorityVote and restarts the existing deadline', () => {
    const game = 'reversi', state = initGame(game), [first, second] = legalGameMoves(game, state), members = [{ id: 'one', team: 1 }, { id: 'three', team: 1 }], actor = { id: 'one', seat: 1 }, rules = voteRulesForGame(game);
    const initialVote = confirmedActionFor('remote', game, first);
    const voted = reduceAuthorityVote(state, initialVote.move, actor, members, true, 100, () => 0, rules);
    const changedVote = confirmedActionFor('remote', game, second);
    const changed = reduceAuthorityVote(voted, changedVote.move, actor, members, true, 500, () => 0, rules);
    expect(voted.vote.deadline).toBe(11_100);
    expect(changed.vote.deadline).toBe(11_500);
    expect(changed.vote.voters).toEqual([{ id: 'one', team: 1, move: changedVote.move }]);
    expect(changed.moves).toBe(0);
  });
});

describe('S10 reserved play status slot DOM/CSS contract', () => {
  it('uses one always-mounted one-line slot for empty, AI, restart, and remote-seat states at phone widths', () => {
    expect(playStatusFor(false, '', 'local', null)).toBe('');
    expect(playStatusFor(true, '', 'ai', null)).toBe('AI 생각중...');
    expect(playStatusFor(false, '상대가 새 판을 시작했습니다', 'remote', 1)).toBe('상대가 새 판을 시작했습니다');
    expect(playStatusFor(false, '', 'remote', 2)).toBe('내 팀 2');
    expect(appSource.match(/play-status-slot/g)).toHaveLength(1);
    expect(styles).toMatch(/\.play-status-slot \{[^}]*min-height:/);
    expect(styles).toMatch(/\.play-status-slot p \{[^}]*white-space: nowrap/);
    expect(styles).not.toMatch(/@media \(max-width: 600px\)[\s\S]*\.play-status-slot[^}]*min-height:\s*0/);
  });
});

describe('S11 latest accepted turn markers across the four-game population', () => {
  it.each(['samok', 'omok', 'yukmok', 'reversi'])('%s marks only newly placed cells for the accepted move', (game) => {
    const initial = initGame(game), move = legalGameMoves(game, initial)[0], next = reduceGame(game, initial, actionForMove(game, move));
    const view = nextLastTurnView(game, { game, state: initial }, next, emptyLast(game));
    expect(view.cells).toEqual([typeof move === 'number' ? { row: next.board.findIndex((row) => row[move] !== 0), column: move } : move]);
    expect(view.moves).toBe(1);
    const rendered = BoardGame({ game, state: next, lastTurn: view.cells });
    const grid = game === 'samok' ? rendered.type(rendered.props) : rendered, cell = view.cells[0];
    expect(grid.props.overlay(cell.row, cell.column, 50, 50).type).toBe(LastTurnMarker);
  });

  it('Yukmok retains both stones from its completed two-stone turn, then restart/game changes clear stale marks', () => {
    const game = 'yukmok', initial = initGame(game), openingMove = legalGameMoves(game, initial)[0], afterOpening = reduceGame(game, initial, actionForMove(game, openingMove));
    const openingView = nextLastTurnView(game, { game, state: initial }, afterOpening, emptyLast(game));
    const first = legalGameMoves(game, afterOpening)[0], afterFirst = reduceGame(game, afterOpening, actionForMove(game, first));
    const firstView = nextLastTurnView(game, { game, state: afterOpening }, afterFirst, openingView);
    const second = legalGameMoves(game, afterFirst)[0], afterSecond = reduceGame(game, afterFirst, actionForMove(game, second));
    const completed = nextLastTurnView(game, { game, state: afterFirst }, afterSecond, firstView);
    expect(completed.cells).toEqual([first, second]);
    expect(nextLastTurnView(game, { game, state: afterSecond }, initGame(game), completed).cells).toEqual([]);
    expect(nextLastTurnView('omok', { game, state: afterSecond }, initGame('omok'), completed).cells).toEqual([]);
  });

  it('a reconnect snapshot that skips accepted transitions establishes a baseline without inventing old last-turn marks', () => {
    const game = 'omok', initial = initGame(game), advanced = legalGameMoves(game, initial).slice(0, 2).reduce((state, move) => reduceGame(game, state, actionForMove(game, move)), initial);
    expect(nextLastTurnView(game, { game, state: initial }, advanced, emptyLast(game)).cells).toEqual([]);
  });

  it('last-turn accessibility and styling are distinct from roulette, vote, forbidden, and preview markers', () => {
    const marker = LastTurnMarker({ cx: 50, cy: 50 });
    expect(marker.props).toMatchObject({ role: 'img', 'aria-label': '마지막 수', class: 'last-turn-marker' });
    for (const name of ['last-turn-marker', 'roulette-highlight', 'vote-marker', 'move-preview']) expect(styles).toContain(`.${name}`);
    expect(styles).toMatch(/\.last-turn-marker \{[^}]*paint-order: stroke/);
    expect(styles).toMatch(/\.roulette-highlight \{[^}]*fill: var\(--accent\)/);
  });
});
