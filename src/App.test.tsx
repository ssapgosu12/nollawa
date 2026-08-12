import { describe, expect, it } from 'vitest';
import { restartNoticeFor } from './App';
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
