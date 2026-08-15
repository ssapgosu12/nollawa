import { describe, expect, it } from 'vitest';
import { canResetFleetVariantPlan } from './components/FleetGame';
import type { FleetRoundPlan } from './game/fleet';

const draft = (submitted = false): FleetRoundPlan => ({
  participantId: 'p1',
  impacts: [{ targetParticipantId: 'p2', cell: { row: 1, column: 1 }, kind: 'normal', shotType: 'flare' }],
  submitted,
  uses: [{ kind: 'card', targetParticipantId: 'p2' }],
});

describe('M3-FLEET-3-INTEGRATION-CORRECTION-R3 reset availability', () => {
  it('uses local staging or an unsubmitted authority draft, while empty and submitted states stay immutable', () => {
    expect(canResetFleetVariantPlan(1, undefined)).toBe(true);
    expect(canResetFleetVariantPlan(0, draft())).toBe(true);
    expect(canResetFleetVariantPlan(0, undefined)).toBe(false);
    expect(canResetFleetVariantPlan(1, draft(true))).toBe(false);
  });
});
