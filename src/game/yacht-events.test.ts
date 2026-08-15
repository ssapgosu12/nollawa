import { describe, expect, it } from 'vitest';
import { appendYachtInput, createYachtDiceOpening, createYachtEventLog, loadYachtEvents, replayYachtEvents, saveYachtEvents, undoYachtInput, yachtPersisted } from './yacht-events';
import type { YachtParticipant } from './yacht-session';

const participants: YachtParticipant[] = [{ id: 'one', name: '하나' }, { id: 'two', name: '둘' }];
const dice = [1, 2, 3, 4, 5] as const;

describe('append-only Yacht event replay and persistence', () => {
  it('derives dice, reroll selection, score, total, and next participant solely by replay', () => {
    let events = createYachtEventLog(participants);
    events = appendYachtInput(events, 'one', { type: 'roll', dice });
    events = appendYachtInput(events, 'one', { type: 'toggle-reroll', index: 0 });
    events = appendYachtInput(events, 'one', { type: 'stop' });
    events = appendYachtInput(events, 'one', { type: 'register', category: 'choice' });
    const state = replayYachtEvents(events);
    expect(state.currentParticipantId).toBe('two');
    expect(state.participants[0]?.turn.entries).toEqual([{ category: 'choice', dice: [1, 2, 3, 4, 5] }]);
    expect(yachtPersisted(events)).toEqual({ kind: 'yacht', semantics: 'reroll-v2', events });
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
    expect(loadYachtEvents(storage)).toEqual(events);
    expect(replayYachtEvents(loadYachtEvents(storage)!)).toEqual(replayYachtEvents(events));
    expect(JSON.parse(memory.values().next().value!).semantics).toBe('reroll-v2');
  });

  it('migrates an actual pre-reroll v1 storage log with legacy hold meaning before returning it', () => {
    const legacy = JSON.stringify({ kind: 'yacht', events: [
      { type: 'start', participants: [{ id: 'one', name: '?섎굹' }] },
      { type: 'input', actorId: 'one', action: { type: 'roll', dice: [1, 2, 3, 4, 5] } },
      { type: 'input', actorId: 'one', action: { type: 'toggle-hold', index: 1 } },
      { type: 'input', actorId: 'one', action: { type: 'roll', dice: [6, 6, 6, 6, 6] } },
    ] });
    const memory = new Map([['nollawa-yacht-events-v1', legacy]]), storage = { getItem: (key: string) => memory.get(key) ?? null };
    const restored = loadYachtEvents(storage);
    expect(restored).not.toBeNull();
    const state = replayYachtEvents(restored!);
    expect(state.participants[0]?.turn.dice).toEqual([6, 2, 6, 6, 6]);
    expect(state.participants[0]?.turn.rerollSelected).toEqual([false, false, false, false, false]);
    expect(JSON.stringify(restored)).not.toContain('toggle-hold');
    expect(memory.get('nollawa-yacht-events-v1')).toBe(legacy);
    const withoutSecondRoll = undoYachtInput(restored!), afterFirstUndo = replayYachtEvents(withoutSecondRoll);
    expect(afterFirstUndo.participants[0]?.turn.dice).toEqual([1, 2, 3, 4, 5]);
    expect(afterFirstUndo.participants[0]?.turn.rerollSelected).toEqual([true, false, true, true, true]);
    const withoutHold = undoYachtInput(withoutSecondRoll), afterSecondUndo = replayYachtEvents(withoutHold);
    expect(afterSecondUndo.participants[0]?.turn.dice).toEqual([1, 2, 3, 4, 5]);
    expect(afterSecondUndo.participants[0]?.turn.rerollSelected).toEqual([false, false, false, false, false]);
  });

  it('restores a legacy log ending after its first roll with no reroll selection', () => {
    const legacy = JSON.stringify({ kind: 'yacht', events: [
      { type: 'start', participants: [{ id: 'one', name: '??롪돌' }] },
      { type: 'input', actorId: 'one', action: { type: 'roll', dice: [1, 2, 3, 4, 5] } },
    ] });
    const restored = loadYachtEvents({ getItem: () => legacy });
    expect(restored).not.toBeNull();
    expect(replayYachtEvents(restored!).participants[0]?.turn.rerollSelected).toEqual([false, false, false, false, false]);
    expect(undoYachtInput(restored!)).toHaveLength(1);
  });

  it('fails malformed legacy logs safely instead of accepting or overwriting them', () => {
    const malformed = JSON.stringify({ kind: 'yacht', events: [
      { type: 'start', participants: [{ id: 'one', name: '?섎굹' }] },
      { type: 'input', actorId: 'one', action: { type: 'roll', dice: [1, 2, 3, 4, 5] } },
      { type: 'input', actorId: 'one', action: { type: 'toggle-hold', index: 9 } },
    ] });
    const malformedCurrent = JSON.stringify({ kind: 'yacht', semantics: 'reroll-v2', events: [
      { type: 'start', participants: [{ id: 'one', name: '?섎굹' }] },
      { type: 'input', actorId: 'one', action: { type: 'toggle-reroll', index: 0 } },
    ] });
    expect(loadYachtEvents({ getItem: () => malformed })).toBeNull();
    expect(loadYachtEvents({ getItem: () => malformedCurrent })).toBeNull();
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
