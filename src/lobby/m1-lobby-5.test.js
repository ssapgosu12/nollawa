import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createFirstPlayerCoin, createSharedGameSelection, createSharedGameStart, gameListModeAfterPlay, initialGameForOpening, requestGameMoveWithRoomBudget } from '../App';
import { Room } from '../../relay/worker.js';

describe('M1-LOBBY-5 acceptance', () => {
  it('S4-SPACING: 게임 목록은 카드 사이에 검증 가능한 1.25rem 간격을 둔다', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.game-list\s*\{[^}]*display:\s*grid;[^}]*gap:\s*1\.25rem;/);
  });

  it('S4-AI-RETURN: AI 대전 뒤 목록 복귀는 local 모드로 돌아가 AI와 시작 조건을 복구한다', () => {
    expect(gameListModeAfterPlay('ai')).toBe('local');
    expect(gameListModeAfterPlay('local')).toBe('local');
  });

  it('S5-COIN: 로컬 시작은 동전으로 선공을 정하고 원격 참가자는 authority의 같은 결과를 받는다', async () => {
    const heads = createFirstPlayerCoin(() => 0, 41);
    const tails = createFirstPlayerCoin(() => .99, 42);
    expect(heads).toEqual({ outcomes: ['H'], replayKey: 41, firstPlayer: 1 });
    expect(tails).toEqual({ outcomes: ['T'], replayKey: 42, firstPlayer: 2 });
    expect(initialGameForOpening('omok', heads.firstPlayer).turn).toBe(1);
    const state = initialGameForOpening('omok', tails.firstPlayer);
    expect(state.turn).toBe(2);

    const sent = [[], []];
    const sockets = sent.map((messages, index) => ({
      readyState: 1,
      deserializeAttachment: () => ({ id: index ? 'peer' : 'host', seat: index ? 2 : 1 }),
      serializeAttachment: vi.fn(),
      send: (message) => messages.push(JSON.parse(message)),
      close: vi.fn(),
    }));
    const stored = new Map([['authority', 'host'], ['seq', 0]]);
    const room = new Room({
      getWebSockets: () => sockets,
      storage: {
        get: async (key) => stored.get(key),
        put: async (values) => Object.entries(values).forEach(([key, value]) => stored.set(key, value)),
      },
    });
    await room.webSocketMessage(sockets[0], JSON.stringify({ type: 'snapshot', game: 'omok', state, opening: tails }));
    expect(sent[0][0].opening).toEqual(tails);
    expect(sent[1][0].opening).toEqual(tails);
    expect(sent[0][0].opening).toEqual(sent[1][0].opening);
  });

  it('S5-SELECT-NO-OPENING: 원격 게임 선택 snapshot은 opening을 만들거나 싣지 않는다', () => {
    const snapshot = createSharedGameSelection('omok');
    expect(snapshot).toMatchObject({ type: 'snapshot', game: 'omok' });
    expect(snapshot).not.toHaveProperty('opening');
  });

  it('S5-START-ONE-OPENING: 방장 start는 authority opening을 정확히 한 번 만들고 동일 결과를 싣는다', () => {
    const authorityOpening = { outcomes: ['T'], replayKey: 73, firstPlayer: 2 };
    const createOpening = vi.fn(() => authorityOpening);
    const snapshot = createSharedGameStart('omok', createOpening);
    expect(createOpening).toHaveBeenCalledTimes(1);
    expect(snapshot.opening).toBe(authorityOpening);
    expect(snapshot.state.turn).toBe(authorityOpening.firstPlayer);
  });

  it('S6-CENTER: AI 선수인 빈 오목과 육목은 탐색을 호출하지 않고 중앙에 둔다', async () => {
    const requester = vi.fn(async () => ({ row: 0, column: 0 }));
    await expect(requestGameMoveWithRoomBudget('omok', initialGameForOpening('omok', 2), null, requester)).resolves.toEqual({ row: 7, column: 7 });
    await expect(requestGameMoveWithRoomBudget('yukmok', initialGameForOpening('yukmok', 2), null, requester)).resolves.toEqual({ row: 9, column: 9 });
    expect(requester).not.toHaveBeenCalled();
  });
});
