import { describe, expect, it, vi } from 'vitest';
import { startYachtWakeLock, yachtProjection, YachtGame } from './YachtGame';
import { appendYachtInput, createYachtEventLog } from '../game/yacht-events';
import { GAME_CATALOG } from '../game/catalog';
import { App, filterGames } from '../App';
import { canStartRoom, type RoomSnapshot } from '../lobby/room-state';

describe('YachtGame screen contract', () => {
  it('exposes a real 1-4-player Yacht catalog/App path and no Yacht AI entry', () => {
    const yacht = GAME_CATALOG.find(({ id }) => id === 'yacht');
    expect(yacht).toMatchObject({ name: '요트 다이스', minPlayers: 1, maxPlayers: 4 }); expect(yacht?.tags).not.toContain('봇 있음');
    expect(filterGames('요트', '3-4', []).map(({ id }) => id)).toEqual(['yacht']);
    expect(App.toString()).toContain('startLocalYacht'); expect(App.toString()).toMatch(/game:\s*["']yacht["']/);
    const room = { code: 'ABC-67', hostId: 'one', game: 'yacht', teamNames: ['왼쪽', '오른쪽'], settings: { aiOpponent: false }, phase: 'lobby', participants: [{ id: 'one', slot: 1, name: '하나', ready: true, present: true }, { id: 'two', slot: 2, name: '둘', ready: true, present: true }] } as RoomSnapshot;
    expect(canStartRoom(room)).toBe(true); expect(canStartRoom({ ...room, participants: [...room.participants, { id: 'three', slot: 3, name: '셋', ready: true, present: true }, { id: 'four', slot: 4, name: '넷', ready: true, present: true }, { id: 'five', slot: 5, name: '다섯', ready: true, present: true }] })).toBe(false);
  });
  it('projects every viewer the same dice, reroll selections, previews, score cards, and current participant', () => {
    let events = createYachtEventLog([{ id: 'one', name: '하나' }, { id: 'two', name: '둘' }]);
    events = appendYachtInput(events, 'one', { type: 'roll', dice: [1, 1, 2, 3, 4] });
    events = appendYachtInput(events, 'one', { type: 'toggle-reroll', index: 0 });
    expect(yachtProjection(events, 'spectator')).toEqual(yachtProjection(events, 'two'));
    expect(yachtProjection(events).participants[0]).toMatchObject({ dice: [1, 1, 2, 3, 4], rerollSelected: [true, false, false, false, false], previews: { ones: 2, choice: 11 } });
  });

  it('keeps selection as preview-only UI and exposes one bottom register action plus forced/pinned sheet hooks', () => {
    const source = YachtGame.toString();
    expect(source).toContain('DiceResults'); expect(source).toContain('score-preview'); expect(source).toContain('yacht-register');
    expect(source).toMatch(/type:\s*["']register["']/); expect(source).toContain('pinned'); expect(source).toContain('yacht-sheet-handle');
  });

  it('acquires, releases while hidden, reacquires when visible, releases on exit, and ignores rejection', async () => {
    let visibilityState: DocumentVisibilityState = 'visible', listener: () => void = () => undefined;
    const doc = { get visibilityState() { return visibilityState; }, addEventListener: (_: string, next: EventListenerOrEventListenerObject) => { listener = next as () => void; }, removeEventListener: vi.fn() };
    const release = vi.fn(async () => undefined), request = vi.fn(async () => ({ release }));
    const stop = startYachtWakeLock({ wakeLock: { request } }, doc); await Promise.resolve(); expect(request).toHaveBeenCalledTimes(1);
    visibilityState = 'hidden'; listener(); await Promise.resolve(); expect(release).toHaveBeenCalledTimes(1);
    visibilityState = 'visible'; listener(); await Promise.resolve(); expect(request).toHaveBeenCalledTimes(2);
    stop(); await Promise.resolve(); expect(release).toHaveBeenCalledTimes(2); expect(doc.removeEventListener).toHaveBeenCalled();
    expect(() => startYachtWakeLock({ wakeLock: { request: vi.fn(async () => { throw new Error('denied'); }) } }, doc)).not.toThrow();
  });
});
