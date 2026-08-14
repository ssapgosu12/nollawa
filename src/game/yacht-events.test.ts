import { describe, expect, it } from 'vitest';
import { appendYachtInput, createYachtDiceOpening, createYachtEventLog, loadYachtEvents, replayYachtEvents, saveYachtEvents, undoYachtInput, yachtPersisted } from './yacht-events';
import type { YachtParticipant } from './yacht-session';

const participants: YachtParticipant[] = [{ id: 'one', name: '하나' }, { id: 'two', name: '둘' }];
const dice = [1, 2, 3, 4, 5] as const;

describe('append-only Yacht event replay and persistence', () => {
  it('derives dice, holds, score, total, and next participant solely by replay', () => {
    let events = createYachtEventLog(participants);
    events = appendYachtInput(events, 'one', { type: 'roll', dice });
    events = appendYachtInput(events, 'one', { type: 'toggle-hold', index: 0 });
    events = appendYachtInput(events, 'one', { type: 'stop' });
    events = appendYachtInput(events, 'one', { type: 'register', category: 'choice' });
    const state = replayYachtEvents(events);
    expect(state.currentParticipantId).toBe('two');
    expect(state.participants[0]?.turn.entries).toEqual([{ category: 'choice', dice: [1, 2, 3, 4, 5] }]);
    expect(yachtPersisted(events)).toEqual({ kind: 'yacht', events });
    expect(JSON.stringify(yachtPersisted(events))).not.toMatch(/upperBonus|upperSubtotal|lowerSubtotal|total/);
  });

  it('rejects wrong and spectator identities without appending, then undo removes exactly one accepted input', () => {
    const start = createYachtEventLog(participants), wrong = appendYachtInput(start, 'two', { type: 'roll', dice }), spectator = appendYachtInput(start, 'watcher', { type: 'roll', dice });
    expect(wrong).toBe(start); expect(spectator).toBe(start);
    const accepted = appendYachtInput(start, 'one', { type: 'roll', dice });
    expect(undoYachtInput(accepted)).toEqual(start);
  });

  it('writes every accepted list and restores the same replayable match, including complete-compatible logs', () => {
    const memory = new Map<string, string>(), storage = { setItem: (key: string, value: string) => memory.set(key, value), getItem: (key: string) => memory.get(key) ?? null };
    const events = appendYachtInput(createYachtEventLog(participants), 'one', { type: 'roll', dice });
    saveYachtEvents(storage, events);
    expect(replayYachtEvents(loadYachtEvents(storage)!)).toEqual(replayYachtEvents(events));
  });

  it('restores a completed one-player match without persisting derived totals', () => {
    let events = createYachtEventLog([{ id: 'one', name: '하나' }]);
    for (const category of ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'four-kind', 'full-house', 'small-straight', 'large-straight', 'yacht'] as const) {
      events = appendYachtInput(events, 'one', { type: 'roll', dice }); events = appendYachtInput(events, 'one', { type: 'stop' }); events = appendYachtInput(events, 'one', { type: 'register', category });
    }
    const memory = new Map<string, string>(), storage = { setItem: (key: string, value: string) => memory.set(key, value), getItem: (key: string) => memory.get(key) ?? null };
    saveYachtEvents(storage, events); expect(replayYachtEvents(loadYachtEvents(storage)!).complete).toBe(true);
  });

  it('rolls only tied participants again for 3-4-player opening', () => {
    const four = [...participants, { id: 'three', name: '셋' }, { id: 'four', name: '넷' }], values = [5 / 6, 5 / 6, 3 / 6, 2 / 6, 1 / 6, 4 / 6]; let index = 0;
    const opening = createYachtDiceOpening(four, () => values[index++]!);
    expect(Object.keys(opening.rounds[1]!)).toEqual(['one', 'two']);
    expect(opening.order.map(({ id }) => id)).toEqual(['two', 'one', 'three', 'four']);
  });
});
