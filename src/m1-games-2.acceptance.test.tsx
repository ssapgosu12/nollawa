import { describe, expect, it, vi } from 'vitest';
import { App, filterGames, requestGameMoveWithRoomBudget, roomMessageTransition, voteRulesForGame } from './App';
import { BoardGame } from './components/BoardGame';
import { EffectsTestPage } from './components/Effects';
import { GAME_CATALOG, initGame, legalGameMoves, moveKey, voteActionForMove, type GameId, type GameState } from './game/catalog';
import { commitResolvedTeamVote, reduceAuthorityVote, resolvedVoteDeadline, roulettePlan, settleTeamVote } from './game/team-vote';
import { participantStatusLabel, type RoomSnapshot } from './lobby/room-state';

const ids = GAME_CATALOG.map(({ id }) => id);
const members = [{ id: 'one', team: 1 as const }, { id: 'three', team: 1 as const }];
const actor = (id: string) => ({ id, seat: 1 as const });
const room = (game: GameId, aiStrength: 'normal' | 'high' = 'normal'): RoomSnapshot => ({
  code: 'ABC-67', hostId: 'one', game, teamNames: ['왼쪽', '오른쪽'], settings: { aiOpponent: true, aiStrength }, phase: 'play',
  participants: [{ id: 'one', slot: 1, name: '하나', ready: true, present: true, activity: 'play' }],
});

describe('ORDER 1 GREEN: merged effects, activities, catalog, renderer, filtering, and search request coexist', () => {
  it('retains both branch feature sets in one callable surface', () => {
    expect(ids).toEqual(['samok', 'omok', 'yukmok', 'reversi']);
    expect(filterGames('', '2', [])).toHaveLength(4);
    for (const id of ids) expect(BoardGame({ game: id, state: initGame(id), onMove: vi.fn() })).toBeTruthy();
    expect(EffectsTestPage).toBeTypeOf('function');
    expect(participantStatusLabel(room('samok'), { id: 'one', slot: 1, name: '하나', ready: true, present: true, activity: 'play' })).toBe('게임 중');
    expect(App.toString()).toContain('AI 생각중...');
  });
});

describe('ORDER 2 GREEN: all four games share opaque authority vote, deadline, roulette, and delayed commit', () => {
  it.each(ids)('%s routes a remote human choice as one serialized vote identity without applying it directly', (id) => {
    const state = initGame(id), move = legalGameMoves(id, state)[0]!, action = voteActionForMove(move);
    expect(action).toEqual({ type: 'vote', move: moveKey(move) });
    const pending = reduceAuthorityVote(state, action.move, actor('one'), members, true, 100, () => 0, voteRulesForGame(id));
    expect(pending.moves).toBe(0);
    expect(pending.vote?.voters).toEqual([{ id: 'one', team: 1, move: action.move }]);
    expect(pending.vote?.deadline).toBe(11_100);
  });

  it.each(ids)('%s preserves unanimous immediate commit and tie waits through the roulette completion boundary', (id) => {
    const rules = voteRulesForGame(id), initial = initGame(id), [first, second] = legalGameMoves(id, initial).map(moveKey);
    const one = reduceAuthorityVote(initial, first!, actor('one'), members, true, 0, () => 0, rules);
    const unanimous = reduceAuthorityVote(one, first!, actor('three'), members, true, 10, () => 0, rules);
    expect(unanimous.moves).toBe(1);
    const open = reduceAuthorityVote(initial, first!, actor('one'), members, true, 0, () => 0, rules);
    const allVoted = reduceAuthorityVote(open, second!, actor('three'), members, true, 10, () => .99, rules);
    expect(allVoted.vote).toMatchObject({ deadline: 1_010, effectsSuppressed: true });
    expect(settleTeamVote(allVoted, members, 1_009, () => .99, rules)).toBe(allVoted);
    const tied = settleTeamVote(allVoted, members, 1_010, () => .99, rules);
    expect(tied.moves).toBe(0);
    expect(roulettePlan(tied.resolvedVote)).toHaveLength(7);
    const deadline = resolvedVoteDeadline(tied)!;
    expect(commitResolvedTeamVote(tied, deadline - 1, rules)).toBe(tied);
    expect(commitResolvedTeamVote(tied, deadline, rules).moves).toBe(1);
  });
});

describe('ORDER 3 GREEN: reconnect room phase-play cannot replace the stored in-progress snapshot', () => {
  it('keeps the current board on the room message, then accepts the stored snapshot, while explicit initialization stays fresh', () => {
    const current = legalGameMoves('omok', initGame('omok')).slice(0, 2).reduce<GameState>((state, move) => voteRulesForGame('omok').applyMove(state, moveKey(move)), initGame('omok'));
    const transition = roomMessageTransition('omok', current, room('omok'));
    expect(transition.state).toBe(current);
    const stored = { ...current, moves: current.moves + 7 } as GameState;
    expect(stored.moves).toBeGreaterThan(transition.state.moves);
    expect(initGame('omok')).toMatchObject({ moves: 0, winner: null, draw: false });
  });
});

describe('ORDER 4 GREEN: room AI strength reaches the actual shared request budget and thinking lifecycle remains present', () => {
  it.each([['normal', 1_000], ['high', 3_000]] as const)('%s passes %i to the requestGameMove mock', async (strength, expected) => {
    const state = initGame('reversi'), requestGameMoveMock = vi.fn(async () => legalGameMoves('reversi', state)[0]!);
    await requestGameMoveWithRoomBudget('reversi', state, room('reversi', strength), requestGameMoveMock);
    expect(requestGameMoveMock).toHaveBeenCalledWith('reversi', state, expected);
    expect(App.toString()).toContain('setAiThinkingVisible');
  });
});
