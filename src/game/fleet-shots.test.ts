/**
 * Causal hypothesis recorded before implementation:
 * Pure pattern/ammo expansion with caller-supplied outcomes can encode the eight
 * independent firing rules without owning turn state or duplicating the reducer.
 *
 * Expected falsifier observation:
 * Any rule needs hidden randomness/state or cannot be represented as serializable
 * planned impacts.
 */
import { describe, expect, it } from 'vitest'
import {
  FLEET_SHOT_TYPES,
  planFleetShots,
  type FleetCell,
  type FleetShotType,
} from './fleet-shots'

const cell = (row: number, column: number): FleetCell => ({ row, column })

describe('fleet shooting type population', () => {
  it('contains exactly the eight named types', () => {
    const expected: FleetShotType[] = [
      'salvo',
      'flare',
      'tracer',
      'explosive',
      'scatter',
      'piercing',
      'random',
      'buckshot',
    ]

    expect(FLEET_SHOT_TYPES).toEqual(expected)
    expect(new Set(FLEET_SHOT_TYPES).size).toBe(8)
  })
})

describe('the named eight-type rule population', () => {
  it('salvo: fixes five shots over three turns with one to three each turn', () => {
    const turns = [
      planFleetShots({
        type: 'salvo',
        turnInCycle: 0,
        previousTurnShotCounts: [],
        cells: [cell(0, 0), cell(0, 1)],
      }),
      planFleetShots({
        type: 'salvo',
        turnInCycle: 1,
        previousTurnShotCounts: [2],
        cells: [cell(1, 0)],
      }),
      planFleetShots({
        type: 'salvo',
        turnInCycle: 2,
        previousTurnShotCounts: [2, 1],
        cells: [cell(2, 0), cell(2, 1)],
      }),
    ]

    expect(turns.map((turn) => turn.length)).toEqual([2, 1, 2])
    expect(turns.flat()).toHaveLength(5)
    expect(() =>
      planFleetShots({
        type: 'salvo',
        turnInCycle: 0,
        previousTurnShotCounts: [],
        cells: [],
      }),
    ).toThrow(/one to three/i)
    expect(() =>
      planFleetShots({
        type: 'salvo',
        turnInCycle: 1,
        previousTurnShotCounts: [3],
        cells: [cell(1, 0), cell(1, 1), cell(1, 2)],
      }),
    ).toThrow(/five shots/i)
  })

  it('flare: emits one normal impact plus two flare impacts', () => {
    expect(
      planFleetShots({
        type: 'flare',
        normalCell: cell(4, 4),
        flareCells: [cell(1, 1), cell(7, 7)],
      }),
    ).toEqual([
      { cell: cell(4, 4), kind: 'normal' },
      { cell: cell(1, 1), kind: 'flare' },
      { cell: cell(7, 7), kind: 'flare' },
    ])
  })

  it('tracer: emits one damaging center and four adjacent flares', () => {
    expect(planFleetShots({ type: 'tracer', center: cell(5, 5) })).toEqual([
      { cell: cell(5, 5), kind: 'normal' },
      { cell: cell(4, 5), kind: 'flare' },
      { cell: cell(5, 6), kind: 'flare' },
      { cell: cell(6, 5), kind: 'flare' },
      { cell: cell(5, 4), kind: 'flare' },
    ])
  })

  it('explosive: alternates a cross-five with one flare on the off turn', () => {
    expect(
      planFleetShots({ type: 'explosive', boardSize: 12, turnIndex: 0, center: cell(6, 6) }),
    ).toEqual([
      { cell: cell(6, 6), kind: 'normal' },
      { cell: cell(5, 6), kind: 'normal' },
      { cell: cell(6, 7), kind: 'normal' },
      { cell: cell(7, 6), kind: 'normal' },
      { cell: cell(6, 5), kind: 'normal' },
    ])
    expect(
      planFleetShots({ type: 'explosive', boardSize: 12, turnIndex: 1, center: cell(2, 3) }),
    ).toEqual([{ cell: cell(2, 3), kind: 'flare' }])
  })

  it('scatter: alternates four corners plus center flare with one normal shot', () => {
    expect(
      planFleetShots({ type: 'scatter', boardSize: 12, turnIndex: 2, center: cell(6, 6) }),
    ).toEqual([
      { cell: cell(5, 5), kind: 'normal' },
      { cell: cell(5, 7), kind: 'normal' },
      { cell: cell(7, 5), kind: 'normal' },
      { cell: cell(7, 7), kind: 'normal' },
      { cell: cell(6, 6), kind: 'flare' },
    ])
    expect(
      planFleetShots({ type: 'scatter', boardSize: 12, turnIndex: 3, center: cell(2, 3) }),
    ).toEqual([{ cell: cell(2, 3), kind: 'normal' }])
  })

  it('piercing: emits exactly two adjacent cells on one straight axis', () => {
    expect(
      planFleetShots({ type: 'piercing', cells: [cell(3, 4), cell(3, 5)] }),
    ).toEqual([
      { cell: cell(3, 4), kind: 'normal' },
      { cell: cell(3, 5), kind: 'normal' },
    ])
    expect(() =>
      planFleetShots({ type: 'piercing', cells: [cell(3, 4), cell(4, 5)] }),
    ).toThrow(/straight adjacent/i)
  })

  it('random: emits one normal plus caller-supplied one or two cells, excluding hits only', () => {
    const previousMiss = cell(7, 7)
    const duplicateOutcome = cell(5, 5)

    expect(
      planFleetShots({
        type: 'random',
        normalCell: cell(2, 2),
        randomCells: [previousMiss, duplicateOutcome],
        alreadyHitCells: [cell(0, 0)],
      }),
    ).toEqual([
      { cell: cell(2, 2), kind: 'normal' },
      { cell: previousMiss, kind: 'normal' },
      { cell: duplicateOutcome, kind: 'normal' },
    ])
    expect(
      planFleetShots({
        type: 'random',
        normalCell: cell(1, 1),
        randomCells: [duplicateOutcome, duplicateOutcome],
        alreadyHitCells: [],
      }),
    ).toHaveLength(3)
    expect(() =>
      planFleetShots({
        type: 'random',
        normalCell: cell(1, 1),
        randomCells: [cell(0, 0)],
        alreadyHitCells: [cell(0, 0)],
      }),
    ).toThrow(/already-hit/i)
  })

  it('buckshot: emits six unique caller-supplied 3+3 cells or one substituted normal shot', () => {
    const shot = planFleetShots({
      type: 'buckshot',
      boardSize: 12,
      choice: 'buckshot',
      center: cell(5, 5),
      centerCells: [cell(4, 4), cell(5, 5), cell(6, 6)],
      outerCells: [cell(3, 3), cell(3, 5), cell(7, 7)],
    })

    expect(shot).toHaveLength(6)
    expect(new Set(shot.map(({ cell: point }) => `${point.row},${point.column}`)).size).toBe(6)
    expect(
      planFleetShots({ type: 'buckshot', boardSize: 12, choice: 'normal', cell: cell(5, 5) }),
    ).toEqual([{ cell: cell(5, 5), kind: 'normal' }])
    expect(() =>
      planFleetShots({
        type: 'buckshot',
        boardSize: 12,
        choice: 'buckshot',
        center: cell(5, 5),
        centerCells: [cell(4, 4), cell(5, 5), cell(6, 6)],
        outerCells: [cell(3, 3), cell(3, 5), cell(3, 3)],
      }),
    ).toThrow(/six unique/i)
  })
})

describe('shared range and replay boundaries', () => {
  it('allows range centers up to two cells outside and rejects the third', () => {
    expect(
      planFleetShots({ type: 'explosive', boardSize: 10, turnIndex: 0, center: cell(-2, 4) }),
    ).toHaveLength(5)
    expect(
      planFleetShots({ type: 'scatter', boardSize: 10, turnIndex: 0, center: cell(11, 4) }),
    ).toHaveLength(5)
    expect(
      planFleetShots({
        type: 'buckshot',
        boardSize: 10,
        choice: 'buckshot',
        center: cell(-2, -2),
        centerCells: [cell(-3, -3), cell(-2, -2), cell(-1, -1)],
        outerCells: [cell(-4, -4), cell(-4, -2), cell(0, 0)],
      }),
    ).toHaveLength(6)
    expect(() =>
      planFleetShots({ type: 'explosive', boardSize: 10, turnIndex: 0, center: cell(-3, 4) }),
    ).toThrow(/outside the board/i)
  })

  it('keeps measured shot counts independent of board and participant populations', () => {
    const plans = [10, 12].map((boardSize) =>
      planFleetShots({
        type: 'buckshot',
        boardSize,
        choice: 'buckshot',
        center: cell(5, 5),
        centerCells: [cell(4, 4), cell(5, 5), cell(6, 6)],
        outerCells: [cell(3, 3), cell(3, 5), cell(7, 7)],
      }),
    )

    expect(plans.map((plan) => plan.length)).toEqual([6, 6])
  })
})
