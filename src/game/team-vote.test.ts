import { describe, expect, it, vi } from 'vitest';
import { samok, type SamokState } from './samok';
import { authorityResolvedVoteDeadline, authorityVoteDeadline, castTeamVote, commitResolvedTeamVote, nextVoteDeadline, reduceAuthorityVote, resolvedVoteDeadline, roulettePlan, settleTeamVote, voteDots, type VoteMember } from './team-vote';

const team = (...ids: string[]): VoteMember[] => ids.map((id) => ({ id, team: 1 }));
const actor = (id: string, seat: 1 | 2 | null = 1) => ({ id, seat });
const cast = (state: SamokState, id: string, column: number, members: VoteMember[], now = 0, random = () => 0) => castTeamVote(state, column, actor(id), members, now, random);

function fullFirstColumn(): SamokState {
  return Array.from({ length: 6 }).reduce<SamokState>((state) => samok.reduce(state, { type: 'drop', column: 0 }), samok.init());
}

describe('L6 TEAM VOTE: 자격·합법성·표 교체', () => {
  it('wrong-team, unseated, forged/duplicate id와 illegal/full column을 모두 거부한다', () => {
    const initial = samok.init();
    expect(castTeamVote(initial, 1, actor('p2', 2), team('p1', 'p2'), 0, () => 0)).toBe(initial);
    expect(castTeamVote(initial, 1, actor('p1', null), team('p1'), 0, () => 0)).toBe(initial);
    expect(castTeamVote(initial, 1, actor('forged'), team('p1'), 0, () => 0)).toBe(initial);
    expect(castTeamVote(initial, 1, actor('p1'), team('p1', 'p1'), 0, () => 0)).toBe(initial);
    expect(castTeamVote(initial, -1, actor('p1'), team('p1'), 0, () => 0)).toBe(initial);
    const full = fullFirstColumn();
    expect(castTeamVote(full, 0, actor('p1'), team('p1'), 0, () => 0)).toBe(full);
  });

  it('같은 id의 두 번째 표는 기존 표를 교체하고 두 표로 늘리지 않는다', () => {
    const members = team('p1', 'p2', 'p3');
    const first = cast(samok.init(), 'p1', 1, members);
    const changed = cast(first, 'p1', 4, members, 1_000);
    expect(changed.vote?.voters).toEqual([{ id: 'p1', team: 1, move: '4' }]);
    expect(changed.vote?.deadline).toBe(16_000);
    expect(cast(changed, 'p1', 4, members, 2_000)).toBe(changed);
  });

  it('persisted snapshot의 중복 voter id도 집계와 dot에서 한 번만 센다', () => {
    const duplicated: SamokState = { ...samok.init(), vote: { turn: 1, deadline: 0, effectsSuppressed: true, voters: [
      { id: 'p1', team: 1, move: '6' }, { id: 'p1', team: 1, move: '6' }, { id: 'p2', team: 1, move: '1' },
    ] } };
    expect(voteDots(duplicated, 'p1')[6]).toEqual({ count: 1, own: true });
    expect(settleTeamVote(duplicated, team('p1', 'p2'), 0, () => 0).resolvedVote?.selected).toBe('1');
  });
});

describe('V1: 마지막 표 기준 절대 마감과 권위 확정', () => {
  it('한 명 팀은 첫 표가 전원 동일 표라 즉시 정확히 한 수를 둔다', () => {
    const resolved = cast(samok.init(), 'solo', 3, team('solo'));
    expect(resolved.moves).toBe(1);
    expect(resolved.board[0]?.[3]).toBe(1);
    expect(resolved.vote).toBeUndefined();
  });

  it('팀 전원이 같은 선택을 하면 마감을 기다리지 않고 즉시 확정한다', () => {
    const members = team('p1', 'p2', 'p3');
    const one = cast(samok.init(), 'p1', 2, members, 10);
    const two = cast(one, 'p2', 2, members, 20);
    const three = cast(two, 'p3', 2, members, 30);
    expect(three.moves).toBe(1);
    expect(three.resolvedVote).toBeUndefined();
    const next = castTeamVote(three, 4, actor('opponent', 2), [{ id: 'opponent', team: 2 }], 40, () => 0);
    expect(next).toMatchObject({ moves: 2, turn: 1 });
    expect(next.board[0]?.[4]).toBe(2);
  });

  it('accepted 새 표와 변경 표마다 미투표자×4+7 마감을 재시작하고 전원 투표는 1초와 effects 숨김을 저장한다', () => {
    const members = team('p1', 'p2', 'p3', 'p4');
    const first = cast(samok.init(), 'p1', 1, members, 1_000);
    expect(first.vote).toMatchObject({ deadline: 20_000, effectsSuppressed: false });
    const second = cast(first, 'p2', 2, members, 3_000);
    expect(second.vote?.deadline).toBe(18_000);
    expect(cast(second, 'p2', 2, members, 4_000)).toBe(second);
    const changed = cast(second, 'p2', 3, members, 5_000);
    expect(changed.vote?.deadline).toBe(20_000);
    const third = cast(changed, 'p3', 4, members, 6_000);
    expect(third.vote?.deadline).toBe(17_000);
    const all = cast(third, 'p4', 5, members, 7_000);
    expect(all.vote).toMatchObject({ deadline: 8_000, effectsSuppressed: true });
    expect(settleTeamVote(all, members, 7_999, () => 0)).toBe(all);
    expect(settleTeamVote(all, members, 8_000, () => 0).resolvedVote).toBeDefined();
  });

  it('W5: 마지막 표 마감에서 유일 최다를 한 번만 적용하고 다음 차례 투표를 연다', () => {
    const random = vi.fn(() => 0.9);
    const open = cast(samok.init(), 'p1', 5, team('p1', 'p2'), 1_000, random);
    expect(nextVoteDeadline(open)).toBe(12_000);
    expect(settleTeamVote(open, team('p1', 'p2'), 11_999, random)).toBe(open);
    const resolved = settleTeamVote(open, team('p1', 'p2'), 12_000, random);
    expect(resolved).toMatchObject({ moves: 1, turn: 2 });
    expect(resolved.board[0]?.[5]).toBe(1);
    expect(resolved.resolvedVote).toBeUndefined();
    const next = castTeamVote(resolved, 4, actor('opponent', 2), [{ id: 'opponent', team: 2 }], 12_001, random);
    expect(next).toMatchObject({ moves: 2, turn: 1 });
    expect(next.board[0]?.[4]).toBe(2);
    expect(random).not.toHaveBeenCalled();
  });

  it('아무 표도 없으면 마감도 timer source도 생기지 않아 무한 대기한다', () => {
    const initial = samok.init();
    expect(nextVoteDeadline(initial)).toBeNull();
    expect(settleTeamVote(initial, team('p1', 'p2'), Number.MAX_SAFE_INTEGER, () => 0)).toBe(initial);
  });
});

describe('L6 TEAM VOTE: 동점 선택·룰렛·단일 착수', () => {
  it('P1: 권위가 당첨을 한 번 저장하고 룰렛 마지막 dwell 전에는 불변, 경계에서 정확히 한 수를 둔다', () => {
    const members = team('p1', 'p2');
    const first = cast(samok.init(), 'p1', 1, members, 0);
    const tied = cast(first, 'p2', 5, members, 1_000);
    const random = vi.fn(() => 0.75);
    const resolved = settleTeamVote(tied, members, 2_000, random);
    expect(random).toHaveBeenCalledTimes(1);
    expect(resolved.resolvedVote).toMatchObject({ selected: '5', presentation: ['5', '1'] });
    expect(resolved.board).toEqual(tied.board);
    expect(resolved.moves).toBe(0);
    expect(resolved.turn).toBe(1);
    expect(resolved.vote).toBeUndefined();
    expect(resolvedVoteDeadline(resolved)).toBe(3_750);
    expect(commitResolvedTeamVote(resolved, 3_749)).toBe(resolved);
    const committed = commitResolvedTeamVote(resolved, 3_750);
    expect(committed.board[0]?.[5]).toBe(1);
    expect(committed).toMatchObject({ moves: 1, turn: 2 });
    expect(committed.resolvedVote).toBeUndefined();
    expect(commitResolvedTeamVote(committed, 99_000)).toBe(committed);
  });

  it('네 개 이상 동점도 stored winner를 포함한 최대 세 presentation 후보만 둔다', () => {
    const members = team('p1', 'p2', 'p3', 'p4');
    let state = cast(samok.init(), 'p1', 0, members, 0);
    state = cast(state, 'p2', 1, members, 10);
    state = cast(state, 'p3', 2, members, 20);
    state = cast(state, 'p4', 3, members, 30);
    const resolved = settleTeamVote(state, members, 1_030, () => 0.99);
    expect(resolved.resolvedVote?.selected).toBe('3');
    expect(resolved.resolvedVote?.presentation).toEqual(['3', '0', '1']);
  });

  it('모든 소비자는 7개의 증가 dwell, 약 2초, stored winner 종착 plan을 도출한다', () => {
    const resolved = { turn: 1 as const, selected: '3', presentation: ['3', '0', '1'], settledAt: 10 };
    const first = roulettePlan(resolved);
    const second = roulettePlan(structuredClone(resolved));
    expect(first).toEqual(second);
    expect(first).toHaveLength(7);
    expect(first.map((step) => step.dwellMs)).toEqual([100, 150, 200, 250, 300, 350, 400]);
    expect(first.reduce((sum, step) => sum + step.dwellMs, 0)).toBe(1_750);
    expect(first.at(-1)?.move).toBe('3');
  });
});

describe('L6 TEAM VOTE: snapshot·권위·UI projection·로컬 보존', () => {
  it('비권위는 composite snapshot을 바꾸지 않고 권위만 바꾼다', () => {
    const initial = samok.init();
    const members = team('p1', 'p2');
    expect(reduceAuthorityVote(initial, 2, actor('p1'), members, false, 0, () => 0)).toBe(initial);
    expect(reduceAuthorityVote(initial, 2, actor('p1'), members, true, 0, () => 0)).not.toBe(initial);
  });

  it('P1: JSON 왕복과 authority 교체 뒤에도 stored winner와 남은 시간을 유지해 한 번만 착수한다', () => {
    const members = team('p1', 'p2', 'p3');
    const open = cast(cast(samok.init(), 'p1', 2, members, 1_000), 'p2', 4, members, 2_000);
    const resumed = JSON.parse(JSON.stringify(open)) as SamokState;
    expect(resumed.vote).toEqual(open.vote);
    expect(nextVoteDeadline(resumed)).toBe(13_000);
    expect(authorityVoteDeadline(resumed, false)).toBeNull();
    expect(authorityVoteDeadline(resumed, true)).toBe(13_000);
    expect(reduceAuthorityVote(resumed, 6, actor('p3'), members, false, 13_000, () => 0)).toBe(resumed);
    const pending = settleTeamVote(resumed, members, 13_000, () => 0.99);
    const transferred = JSON.parse(JSON.stringify(pending)) as SamokState;
    expect(transferred.resolvedVote).toMatchObject({ selected: '4', settledAt: 13_000 });
    expect(authorityResolvedVoteDeadline(transferred, false)).toBeNull();
    expect(authorityResolvedVoteDeadline(transferred, true)).toBe(14_750);
    expect(commitResolvedTeamVote(transferred, 14_749)).toBe(transferred);
    const committed = commitResolvedTeamVote(transferred, 14_750);
    expect(committed.board[0]?.[4]).toBe(1);
    expect(commitResolvedTeamVote(committed, 9_000)).toBe(committed);
  });

  it('열별 dot 수와 내 표 하나를 투영하며 상대에게도 같은 count를 보인다', () => {
    const members = team('me', 'peer', 'third');
    const voted = cast(cast(samok.init(), 'me', 2, members), 'peer', 2, members, 1_000);
    expect(voteDots(voted, 'me')[2]).toEqual({ count: 2, own: true });
    expect(voteDots(voted, 'opponent')[2]).toEqual({ count: 2, own: false });
  });

  it('local/AI의 직접 drop은 투표 gate 없이 기존 reducer로 즉시 둔다', () => {
    const local = samok.reduce(samok.init(), { type: 'drop', column: 6 });
    expect(local.moves).toBe(1);
    expect(local.board[0]?.[6]).toBe(1);
    expect(local.vote).toBeUndefined();
  });
});
