import { describe, expect, it, vi } from 'vitest';
import { createUpdateConsentController, fleetGameInstanceKey } from './App';
import { createVariantFleetState, fleetActorId, reduceFleet, type FleetState } from './game/fleet';

const people = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `local-${index + 1}`, name: `${index + 1}P` }));

function confirmSetup(state: FleetState): FleetState {
  const actorId = fleetActorId(state)!;
  const setup = state.participants.find(({ id }) => id === actorId)!.variantSetup!;
  const preset = setup.presetOffers[0]!;
  const withPreset = reduceFleet(state, actorId, { type: 'choose-variant-preset', presetId: preset.id });
  const choiceCount = state.participants.length === 2 ? 1 : 2;
  return reduceFleet(withPreset, actorId, { type: 'choose-special-ships', specialShips: preset.specialShipOffers.slice(0, choiceCount) });
}

describe('B-21 update consent behavior', () => {
  it('ignores first-visit claim, activates a waiting update only after confirmation, and reloads exactly once', () => {
    const reload = vi.fn(), postMessage = vi.fn();
    const update = createUpdateConsentController(reload);

    expect(update.controllerChanged()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(update.confirm({ postMessage })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: 'ACTIVATE_UPDATE' });
    expect(update.controllerChanged()).toBe(true);
    expect(update.controllerChanged()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('B-20 local FleetGame actor boundary behavior', () => {
  it('keeps one actor instance stable, gives participant 2 a clean instance, and reaches placement after participant 2 confirms', () => {
    let state = createVariantFleetState(people(2), () => 0.375);
    const participant1Key = fleetGameInstanceKey(state, 'local', null);
    const participant1 = state.participants[0]!, preset1 = participant1.variantSetup!.presetOffers[0]!;
    const participant1Choosing = reduceFleet(state, participant1.id, { type: 'choose-variant-preset', presetId: preset1.id });
    expect(fleetGameInstanceKey(participant1Choosing, 'local', null)).toBe(participant1Key);

    state = confirmSetup(state);
    const participant2Key = fleetGameInstanceKey(state, 'local', null);
    expect(participant2Key).toBe('local-2');
    expect(participant2Key).not.toBe(participant1Key);
    expect(state.participants[1]!.variantSetup!.selectedSpecialShips).toEqual([]);

    state = confirmSetup(state);
    expect(state.phase).toBe('placement');
    expect(state.placementParticipantId).toBe('local-1');
  });

  it('uses a distinct clean instance for each of three local participants', () => {
    let state = createVariantFleetState(people(3), () => 0.375);
    const keys: (string | null)[] = [];
    for (const expectedActor of ['local-1', 'local-2', 'local-3']) {
      keys.push(fleetGameInstanceKey(state, 'local', null));
      expect(fleetActorId(state)).toBe(expectedActor);
      expect(state.participants.find(({ id }) => id === expectedActor)!.variantSetup!.selectedSpecialShips).toEqual([]);
      state = confirmSetup(state);
    }
    expect(new Set(keys).size).toBe(3);
    expect(state.phase).toBe('placement');
  });
});
