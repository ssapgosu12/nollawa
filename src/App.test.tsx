import { describe, expect, it } from 'vitest';
import { applyAuthorityAiMove, identitySeat, remoteBoardDisabled, remoteSeatLabel, restartNoticeFor, roomVoteMembers, shouldRequestAiMove } from './App';
import { applyRemoteAction, samok, type SamokState } from './game/samok';

function terminalState(): SamokState {
  return [0, 0, 1, 1, 2, 2, 3]
    .reduce((state, column) => samok.reduce(state, { type: 'drop', column }), samok.init());
}

describe('M0-FEEDBACK 원격 재시작', () => {
  it('F1: 한 번의 승인된 재시작 스냅샷은 상대에게만 정확한 알림을 만든다', () => {
    const action = { type: 'restart' } as const;
    const terminal = terminalState();
    const state = applyRemoteAction(terminal, action, 1);
    const source = { actor: { id: 'player-one', seat: 1 as const }, action };
    const snapshot = { state, source };

    expect(snapshot.state.moves).toBe(0);
    expect(applyRemoteAction(terminal, action, 2)).not.toBe(terminal);
    expect(restartNoticeFor(snapshot.source, 'player-two', 2)).toBe('상대가 새 판을 시작했습니다');
    expect(restartNoticeFor(snapshot.source, 'player-one', 1)).toBe('');
    expect(restartNoticeFor(snapshot.source, 'spectator', null)).toBe('');
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

describe('N4 AI-ON/OFF: authoritative voters and AI turn owner', () => {
  const room = (aiOpponent: boolean) => ({
    code: 'ABC-67', hostId: 'p1', game: 'samok', teamNames: ['왼쪽', '오른쪽'] as [string, string], settings: { aiOpponent }, phase: 'play' as const,
    participants: [
      { id: 'p1', slot: 1, name: '하나', ready: true, present: true },
      { id: 'p2', slot: 2, name: '둘', ready: true, present: true },
      { id: 'p3', slot: 3, name: '셋', ready: true, present: true },
    ],
  });

  it('AI-on 인간 턴은 좌우 슬롯 전원이 voter이고 AI 턴은 인간 voter가 없으며 AI-off는 팀별이다', () => {
    expect(roomVoteMembers(room(true), 1)).toEqual(['p1', 'p2', 'p3'].map((id) => ({ id, team: 1 })));
    expect(roomVoteMembers(room(true), 2)).toEqual([]);
    expect(roomVoteMembers(room(false), 1)).toEqual([{ id: 'p1', team: 1 }, { id: 'p3', team: 1 }]);
    expect(roomVoteMembers(room(false), 2)).toEqual([{ id: 'p2', team: 2 }]);
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
