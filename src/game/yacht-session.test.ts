import { describe, expect, it } from 'vitest';
import { YACHT_CATEGORIES, type YachtCategory, type YachtDie } from './yacht';
import {
  createYachtSession,
  openingMethodForPlayerCount,
  projectYachtSession,
  reduceAuthorityYachtSession,
  reduceLocalYachtSession,
  resolveYachtOpeningOrder,
  type YachtParticipant,
  type YachtSessionState,
} from './yacht-session';

const DICE: readonly YachtDie[] = [1, 2, 3, 4, 5];

function players(count: number): YachtParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
  }));
}

function register(state: YachtSessionState, category: YachtCategory, dice = DICE): YachtSessionState {
  let next = reduceLocalYachtSession(state, { type: 'roll', dice });
  next = reduceLocalYachtSession(next, { type: 'stop' });
  return reduceLocalYachtSession(next, { type: 'register', category });
}

describe('Yacht session turns', () => {
  for (const count of [1, 2, 3, 4]) {
    it(`cycles ${count} configured participant(s) by stable id through all scorecards`, () => {
      const configured = players(count);
      let state = createYachtSession(configured);
      const observed: string[] = [];
      for (const category of YACHT_CATEGORIES) {
        for (let playerIndex = 0; playerIndex < count; playerIndex += 1) {
          observed.push(state.currentParticipantId);
          state = register(state, category, [
            (playerIndex + 1) as YachtDie, 2, 3, 4, 5,
          ]);
        }
      }
      expect(observed).toEqual(Array.from({ length: 12 }, () => configured.map(({ id }) => id)).flat());
      expect(state.complete).toBe(true);
      expect(state.participants.map(({ id }) => id)).toEqual(configured.map(({ id }) => id));
      for (const [index, participant] of state.participants.entries()) {
        expect(participant.turn.entries).toHaveLength(12);
        expect(participant.turn.entries.map(({ category }) => category)).toEqual(YACHT_CATEGORIES);
        expect(participant.turn.entries[0]!.dice[0]).toBe(index + 1);
      }
    });
  }
});

describe('authority and public projection', () => {
  it('accepts only the transport-supplied current participant identity', () => {
    const state = createYachtSession(players(2));
    const spectator = reduceAuthorityYachtSession(state, 'spectator', { type: 'roll', dice: DICE });
    const wrongPlayer = reduceAuthorityYachtSession(state, 'player-2', { type: 'roll', dice: DICE });
    const spoofedPayload = reduceAuthorityYachtSession(state, 'spectator', {
      type: 'roll', dice: DICE, participantId: 'player-1',
    } as Parameters<typeof reduceAuthorityYachtSession>[2]);
    expect(spectator).toBe(state);
    expect(wrongPlayer).toBe(state);
    expect(spoofedPayload).toBe(state);

    const accepted = reduceAuthorityYachtSession(state, 'player-1', { type: 'roll', dice: DICE });
    expect(accepted).not.toBe(state);
    expect(accepted.participants[0]!.turn.dice).toEqual(DICE);
  });

  it('projects every participant dice, reroll selections, rolls, scores, previews, and current turn to every viewer', () => {
    let state = createYachtSession(players(2));
    state = reduceAuthorityYachtSession(state, 'player-1', { type: 'roll', dice: DICE });
    state = reduceAuthorityYachtSession(state, 'player-1', { type: 'toggle-reroll', index: 2 });
    state = reduceAuthorityYachtSession(state, 'player-1', { type: 'stop' });
    const spectatorView = projectYachtSession(state, 'spectator');
    const opponentView = projectYachtSession(state, 'player-2');
    expect(spectatorView).toEqual(opponentView);
    expect(spectatorView.currentParticipantId).toBe('player-1');
    expect(spectatorView.participants[0]).toMatchObject({
      id: 'player-1', dice: DICE, rerollSelected: [false, false, true, false, false], rolls: 1,
      scoreCard: { scores: {}, total: 0 },
      previews: { choice: 15, 'small-straight': 15, 'large-straight': 30 },
    });
    expect(spectatorView.participants[1]).toMatchObject({
      id: 'player-2', dice: null, rerollSelected: [false, false, false, false, false], rolls: 0,
      scoreCard: { scores: {}, total: 0 }, previews: {},
    });
  });
});

describe('shared opening order', () => {
  it('selects the existing common coin path for two and passes through its first-player result', () => {
    const configured = players(2);
    expect(openingMethodForPlayerCount(2)).toBe('common-coin');
    expect(resolveYachtOpeningOrder(configured, {
      method: 'common-coin', firstParticipantId: 'player-2',
    }).map(({ id }) => id)).toEqual(['player-2', 'player-1']);
    expect(() => resolveYachtOpeningOrder(configured, {
      method: 'participant-dice', rounds: [{ 'player-1': 6, 'player-2': 1 }],
    })).toThrow(/common-coin/);
  });

  it('keeps the only participant without rolls', () => {
    expect(openingMethodForPlayerCount(1)).toBe('single');
    expect(resolveYachtOpeningOrder(players(1), { method: 'single' }).map(({ id }) => id))
      .toEqual(['player-1']);
  });

  it('sorts 3-4 participants high first using exactly one d6 each in the first round', () => {
    expect(openingMethodForPlayerCount(3)).toBe('participant-dice');
    expect(resolveYachtOpeningOrder(players(3), {
      method: 'participant-dice',
      rounds: [{ 'player-1': 2, 'player-2': 6, 'player-3': 4 }],
    }).map(({ id }) => id)).toEqual(['player-2', 'player-3', 'player-1']);
    expect(() => resolveYachtOpeningOrder(players(4), {
      method: 'participant-dice',
      rounds: [{ 'player-1': 6, 'player-2': 5, 'player-3': 4 }],
    })).toThrow(/exactly/);
  });

  it('rerolls only tied participants across independent groups and repeated ties', () => {
    const order = resolveYachtOpeningOrder(players(4), {
      method: 'participant-dice',
      rounds: [
        { 'player-1': 6, 'player-2': 6, 'player-3': 2, 'player-4': 2 },
        { 'player-1': 5, 'player-2': 1, 'player-3': 3, 'player-4': 3 },
        { 'player-3': 4, 'player-4': 2 },
      ],
    });
    expect(order.map(({ id }) => id)).toEqual(['player-1', 'player-2', 'player-3', 'player-4']);
    expect(() => resolveYachtOpeningOrder(players(4), {
      method: 'participant-dice',
      rounds: [
        { 'player-1': 6, 'player-2': 6, 'player-3': 2, 'player-4': 1 },
        { 'player-1': 5, 'player-2': 4, 'player-3': 3 },
      ],
    })).toThrow(/exactly/);
  });
});
