import { describe, expect, it } from 'vitest';
import { reduceRematchConsent, rematchProgress, type RematchMember } from './rematch-consent';
import { samok, type SamokState } from './samok';

const members: RematchMember[] = [{ id: 'p1', name: '하나' }, { id: 'p2', name: '둘' }];
const terminalState = (): SamokState => [0, 0, 1, 1, 2, 2, 3]
  .reduce((state, column) => samok.reduce(state, { type: 'drop', column }), samok.init());

describe('N1 REMATCH CONSENT: authoritative snapshot pure functions', () => {
  it('room-member population을 unique denominator로 삼아 count와 pending names를 계산한다', () => {
    const state = { ...terminalState(), rematchConsent: ['p1', 'spectator'] };
    expect(rematchProgress(state, [...members, members[0]!], 'p1')).toEqual({
      ready: 1, total: 2, pendingNames: ['둘'], selfReady: true,
    });
  });

  it('첫 unique member 동의를 직렬화해 terminal board를 보존하고 reconnect에서도 같은 진행을 복구한다', () => {
    const terminal = terminalState();
    const partial = reduceRematchConsent(terminal, 'p1', members);
    const restored = JSON.parse(JSON.stringify(partial)) as SamokState;

    expect(partial.board).toBe(terminal.board);
    expect(partial.rematchConsent).toEqual(['p1']);
    expect(samok.terminal(partial).ended).toBe(true);
    expect(rematchProgress(restored, members, 'p2')).toEqual({ ready: 1, total: 2, pendingNames: ['둘'], selfReady: false });
  });

  it('duplicate, non-member/spectator, nonterminal restart는 동의나 reset을 진행하지 않는다', () => {
    const terminal = terminalState();
    const partial = reduceRematchConsent(terminal, 'p1', members);
    expect(reduceRematchConsent(partial, 'p1', members)).toBe(partial);
    expect(reduceRematchConsent(partial, 'spectator', members)).toBe(partial);
    const active = samok.init();
    expect(reduceRematchConsent(active, 'p1', members)).toBe(active);
  });

  it('마지막 unique member만 existing restart를 정확히 한 번 적용하고 consent를 지우며 F3 선공을 뒤집는다', () => {
    const partial = reduceRematchConsent(terminalState(), 'p1', members);
    const reset = reduceRematchConsent(partial, 'p2', members);

    expect(reset).toEqual({ ...samok.init(), turn: 2 });
    expect(reset.rematchConsent).toBeUndefined();
    expect(reduceRematchConsent(reset, 'p2', members)).toBe(reset);
  });
});
