import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_MOVE_DELAY_MS, aiBudgetMs, applyAuthorityAiMove, applyAuthorityRematch, identitySeat, leaveForTitle, remoteBoardDisabled, remoteRematchPresentation, remoteSeatLabel, restartNoticeFor, returnToLobby, roomRematchMembers, roomVoteMembers, shouldRequestAiMove, waitForAiMoveGate, withAiMoveGate } from './App';
import { samok, type SamokState } from './game/samok';

function terminalState(): SamokState {
  return [0, 0, 1, 1, 2, 2, 3]
    .reduce((state, column) => samok.reduce(state, { type: 'drop', column }), samok.init());
}

describe('N1 REMATCH CONSENT: App authority routing and presentation', () => {
  const room = (participants = [
    { id: 'player-one', slot: 1, name: '하나', ready: true, present: true },
    { id: 'player-two', slot: 2, name: '둘', ready: true, present: true },
  ], aiOpponent = false) => ({
    code: 'ABC-67', hostId: 'player-one', game: 'samok', teamNames: ['왼쪽', '오른쪽'] as [string, string], settings: { aiOpponent }, phase: 'play' as const, participants,
  });

  it('첫 사람은 terminal board를 유지하며 count와 pending name만 바꾸고 reset 전 옛 알림을 만들지 않는다', () => {
    const terminal = terminalState();
    const actor = { id: 'player-one', seat: 1 as const };
    const state = applyAuthorityRematch(terminal, actor, room(), true);
    const source = { actor, action: { type: 'restart' } as const };

    expect(state.board).toBe(terminal.board);
    expect(samok.terminal(state).ended).toBe(true);
    expect(remoteRematchPresentation(state, room(), 'player-one')).toEqual({ ready: 1, total: 2, pendingNames: ['둘'], selfReady: true });
    expect(restartNoticeFor(state, source, 'player-two', 2)).toBe('');
  });

  it('마지막 사람만 한 번 reset하고 F3 교대 뒤에만 상대 알림을 만들며 non-authority는 무시한다', () => {
    const terminal = terminalState();
    const first = applyAuthorityRematch(terminal, { id: 'player-one', seat: 1 }, room(), true);
    const actor = { id: 'player-two', seat: 2 as const };
    const reset = applyAuthorityRematch(first, actor, room(), true);
    const source = { actor, action: { type: 'restart' } as const };

    expect(reset).toEqual({ ...samok.init(), turn: 2 });
    expect(restartNoticeFor(reset, source, 'player-one', 1)).toBe('상대가 새 판을 시작했습니다');
    expect(applyAuthorityRematch(first, actor, room(), false)).toBe(first);
  });

  it('사람 한 명인 remote와 AI-opponent room은 그 사람 동의 즉시 reset한다', () => {
    const only = [{ id: 'player-one', slot: 1, name: '혼자', ready: true, present: true }];
    const actor = { id: 'player-one', seat: 1 as const };
    expect(applyAuthorityRematch(terminalState(), actor, room(only), true).moves).toBe(0);
    expect(applyAuthorityRematch(terminalState(), actor, room(only, true), true).moves).toBe(0);
  });
});

describe('M1-LOBBY CORRECTION: identity 팀 projection', () => {
  it('재연결 없이 새 identity seat를 팀 표시와 보드 잠금에 같이 적용한다', () => {
    const state = samok.init();
    const movedSeat = identitySeat({ type: 'identity', id: 'player', authority: 'host', seat: 2 });
    expect(remoteSeatLabel(movedSeat)).toBe('내 팀 2');
    expect(remoteBoardDisabled(state, movedSeat)).toBe(true);

    const swappedSeat = identitySeat({ type: 'identity', id: 'player', authority: 'host', seat: 1 });
    expect(remoteSeatLabel(swappedSeat)).toBe('내 팀 1');
    expect(remoteBoardDisabled(state, swappedSeat)).toBe(false);
  });
});

describe('L6 TEAM VOTE: authoritative room membership', () => {
  it('authoritative room snapshot의 홀짝 슬롯만 현재 팀 voter 모집단으로 투영한다', () => {
    const room = {
      code: 'ABC-67', hostId: 'p1', game: 'samok', teamNames: ['왼쪽', '오른쪽'] as [string, string], settings: { aiOpponent: false }, phase: 'play' as const,
      participants: [
        { id: 'p1', slot: 1, name: '하나', ready: true, present: true },
        { id: 'p2', slot: 2, name: '둘', ready: true, present: true },
        { id: 'p3', slot: 3, name: '셋', ready: true, present: false },
      ],
    };
    expect(roomVoteMembers(room, 1)).toEqual([{ id: 'p1', team: 1 }, { id: 'p3', team: 1 }]);
    expect(roomVoteMembers(room, 2)).toEqual([{ id: 'p2', team: 2 }]);
  });
});

describe('A1: authoritative human voters and AI seat 2 owner', () => {
  const room = (aiOpponent: boolean) => ({
    code: 'ABC-67', hostId: 'p1', game: 'samok', teamNames: ['왼쪽', '오른쪽'] as [string, string], settings: { aiOpponent }, phase: 'play' as const,
    participants: [
      { id: 'p1', slot: 1, name: '하나', ready: true, present: true },
      { id: 'p2', slot: 2, name: '둘', ready: true, present: true },
      { id: 'p3', slot: 3, name: '셋', ready: true, present: true },
      { id: 'p4', slot: 4, name: '넷', ready: true, present: true },
      { id: 'p5', slot: 5, name: '다섯', ready: true, present: true },
      { id: 'p6', slot: 6, name: '여섯', ready: true, present: true },
    ],
  });

  it('AI-on 인간 턴은 좌우 슬롯 전원이 voter이고 AI 턴은 인간 voter가 없으며 AI-off는 팀별이다', () => {
    expect(roomVoteMembers(room(true), 1)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => ({ id, team: 1 })));
    expect(roomVoteMembers(room(true), 2)).toEqual([]);
    expect(roomVoteMembers(room(false), 1)).toEqual([{ id: 'p1', team: 1 }, { id: 'p3', team: 1 }, { id: 'p5', team: 1 }]);
    expect(roomVoteMembers(room(false), 2)).toEqual([{ id: 'p2', team: 2 }, { id: 'p4', team: 2 }, { id: 'p6', team: 2 }]);
  });

  it('remote AI는 현재 authority만 요청·적용해 2번 돌을 만들고 non-authority와 AI-off는 적용하지 않는다', () => {
    expect(shouldRequestAiMove('remote', room(true), true)).toBe(true);
    expect(shouldRequestAiMove('remote', room(true), false)).toBe(false);
    expect(shouldRequestAiMove('remote', room(false), true)).toBe(false);
    const aiTurn = samok.reduce(samok.init(), { type: 'drop', column: 0 });
    expect(applyAuthorityAiMove(aiTurn, 1, false)).toBe(aiTurn);
    const moved = applyAuthorityAiMove(aiTurn, 1, true);
    expect(moved).toMatchObject({ turn: 1, moves: 2 });
    expect(moved.board[0]?.[1]).toBe(2);
  });
});

describe('P2 AI 착수 공통 최소 지연과 stale 취소', () => {
  afterEach(() => vi.useRealTimers());

  it('P2: local과 remote 분기 앞의 공통 gate는 1000ms 전에는 열리지 않는다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    let opened = false;
    const gate = waitForAiMoveGate(Date.now()).then((value) => { opened = value; });
    await vi.advanceTimersByTimeAsync(AI_MOVE_DELAY_MS - 1);
    expect(opened).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await gate;
    expect(opened).toBe(true);
  });

  it('P2: 화면·상태·authority 변경으로 취소된 stale gate는 AI 수를 허용하지 않는다', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const gate = waitForAiMoveGate(Date.now(), controller.signal);
    await vi.advanceTimersByTimeAsync(999);
    controller.abort();
    expect(await gate).toBe(false);
    await vi.runAllTimersAsync();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('S2/S3: App 공통 AI budget과 생각중 lifecycle', () => {
  afterEach(() => vi.useRealTimers());

  it('normal/high snapshot을 App request gate의 정확한 1000/3000ms로 매핑한다', () => {
    expect(aiBudgetMs(null)).toBe(1_000);
    expect(aiBudgetMs({ settings: { aiOpponent: true } } as Parameters<typeof aiBudgetMs>[0])).toBe(1_000);
    expect(aiBudgetMs({ settings: { aiOpponent: true, aiStrength: 'high' } } as Parameters<typeof aiBudgetMs>[0])).toBe(3_000);
  });

  it.each(['local', 'remote'])('%s authority path는 전체 active request 동안 AI 생각중...을 유지하고 완료/취소 때 제거한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    let finish!: (value: number) => void;
    const request = new Promise<number>((resolve) => { finish = resolve; });
    const visible: string[] = [];
    const controller = new AbortController();
    const gated = withAiMoveGate(request, Date.now(), 1_000, controller.signal, (active) => visible.push(active ? 'AI 생각중...' : ''));
    expect(visible).toEqual(['AI 생각중...']);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(visible).toEqual(['AI 생각중...']);
    finish(3);
    await expect(gated).resolves.toEqual([3, true]);
    expect(visible).toEqual(['AI 생각중...', '']);
    const cancelled: string[] = [];
    const abort = new AbortController();
    const stale = withAiMoveGate(Promise.resolve(4), Date.now(), 3_000, abort.signal, (active) => cancelled.push(active ? 'AI 생각중...' : ''));
    abort.abort();
    await expect(stale).resolves.toEqual([null, false]);
    expect(cancelled).toEqual(['AI 생각중...', '']);
  });

  it('late joiner: lobby/games 참가자는 vote와 rematch 분모에 없고 activity 없는 legacy play 참가자는 유지한다', () => {
    const room = {
      code: 'ABC-67', hostId: 'legacy', game: 'samok', teamNames: ['왼쪽', '오른쪽'] as [string, string], settings: { aiOpponent: false }, phase: 'play' as const,
      participants: [
        { id: 'legacy', slot: 1, name: '기존', ready: true, present: true },
        { id: 'active', slot: 2, name: '대국 중', ready: true, present: true, activity: 'play' as const },
        { id: 'waiting', slot: 3, name: '늦게 입장', ready: false, present: true, activity: 'lobby' as const },
        { id: 'browsing', slot: 4, name: '게임 목록', ready: false, present: true, activity: 'games' as const },
      ],
    };
    expect(roomVoteMembers(room, 1)).toEqual([{ id: 'legacy', team: 1 }]);
    expect(roomVoteMembers(room, 2)).toEqual([{ id: 'active', team: 2 }]);
    expect(roomRematchMembers(room)).toEqual([{ id: 'legacy', name: '기존' }, { id: 'active', name: '대국 중' }]);
  });
});

describe('P4: 대국 화면의 서로 다른 퇴장 동작', () => {
  it('로비 복귀는 relay command만 보내고 타이틀 나가기는 leave command 뒤 transport와 화면을 닫는다', () => {
    const events: string[] = [];
    returnToLobby((command) => events.push(command.command));
    expect(events).toEqual(['return-lobby']);
    leaveForTitle((command) => events.push(command.command), () => events.push('close'), () => events.push('title'));
    expect(events).toEqual(['return-lobby', 'leave-room', 'close', 'title']);
  });

  it('제거된 guest는 authoritative voter 모집단에도 남지 않는다', () => {
    const room = {
      code: 'ABC-67', hostId: 'p1', game: 'samok', teamNames: ['왼쪽', '오른쪽'] as [string, string], settings: { aiOpponent: false }, phase: 'play' as const,
      participants: [{ id: 'p1', slot: 1, name: '방장', ready: true, present: true }],
    };
    expect(roomVoteMembers(room, 1)).toEqual([{ id: 'p1', team: 1 }]);
    expect(roomVoteMembers(room, 2)).toEqual([]);
  });
});
