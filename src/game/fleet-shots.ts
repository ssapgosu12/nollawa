export const FLEET_SHOT_TYPES = [
  'salvo',
  'flare',
  'tracer',
  'explosive',
  'scatter',
  'piercing',
  'random',
  'buckshot',
] as const

export type FleetShotType = (typeof FLEET_SHOT_TYPES)[number]
export type FleetImpactKind = 'normal' | 'flare'

export interface FleetCell {
  row: number
  column: number
}

export interface FleetPlannedImpact {
  cell: FleetCell
  kind: FleetImpactKind
}

export interface NormalShotPlan { type: 'normal'; cell: FleetCell }

export interface SalvoShotPlan {
  type: 'salvo'
  turnInCycle: 0 | 1 | 2
  previousTurnShotCounts: readonly number[]
  cells: readonly FleetCell[]
}

export interface FlareShotPlan {
  type: 'flare'
  normalCell: FleetCell
  flareCells: readonly [FleetCell, FleetCell]
}

export interface TracerShotPlan {
  type: 'tracer'
  center: FleetCell
}

export interface AlternatingRangeShotPlan {
  type: 'explosive' | 'scatter'
  boardSize: number
  turnIndex: number
  center: FleetCell
}

export interface PiercingShotPlan {
  type: 'piercing'
  cells: readonly [FleetCell, FleetCell]
}

export interface RandomShotPlan {
  type: 'random'
  normalCell: FleetCell
  randomCells: readonly FleetCell[]
  alreadyHitCells: readonly FleetCell[]
}

export interface BuckshotNormalPlan {
  type: 'buckshot'
  boardSize: number
  choice: 'normal'
  cell: FleetCell
}

export interface BuckshotSpreadPlan {
  type: 'buckshot'
  boardSize: number
  choice: 'buckshot'
  center: FleetCell
  centerCells: readonly [FleetCell, FleetCell, FleetCell]
  outerCells: readonly [FleetCell, FleetCell, FleetCell]
}

export type FleetShotPlan =
  | NormalShotPlan
  | SalvoShotPlan
  | FlareShotPlan
  | TracerShotPlan
  | AlternatingRangeShotPlan
  | PiercingShotPlan
  | RandomShotPlan
  | BuckshotNormalPlan
  | BuckshotSpreadPlan

const SALVO_TOTAL_SHOTS = 5
const SALVO_TURNS = 3
const SALVO_MIN_PER_TURN = 1
const SALVO_MAX_PER_TURN = 3
const RANGE_CENTER_PADDING = 2

const sameCell = (left: FleetCell, right: FleetCell) =>
  left.row === right.row && left.column === right.column

const cellKey = ({ row, column }: FleetCell) => `${row},${column}`

const impact = (cell: FleetCell, kind: FleetImpactKind): FleetPlannedImpact => ({
  cell: { row: cell.row, column: cell.column },
  kind,
})

const assertIntegerCell = (cell: FleetCell) => {
  if (!Number.isInteger(cell.row) || !Number.isInteger(cell.column)) {
    throw new Error('Fleet shot cells must use integer coordinates')
  }
}

const assertBoardSize = (boardSize: number) => {
  if (!Number.isInteger(boardSize) || boardSize <= 0) {
    throw new Error('Fleet board size must be a positive integer')
  }
}

const assertRangeCenter = (center: FleetCell, boardSize: number) => {
  assertBoardSize(boardSize)
  assertIntegerCell(center)
  const minimum = -RANGE_CENTER_PADDING
  const maximum = boardSize - 1 + RANGE_CENTER_PADDING
  if (
    center.row < minimum ||
    center.row > maximum ||
    center.column < minimum ||
    center.column > maximum
  ) {
    throw new Error('Range center may be at most two cells outside the board')
  }
}

const planSalvo = (plan: SalvoShotPlan) => {
  const { cells, previousTurnShotCounts, turnInCycle } = plan
  if (previousTurnShotCounts.length !== turnInCycle) {
    throw new Error('Salvo history must contain one count for each previous turn')
  }
  const allCounts = [...previousTurnShotCounts, cells.length]
  if (allCounts.some((count) => !Number.isInteger(count) || count < 1 || count > 3)) {
    throw new Error('Salvo must fire one to three shots per turn')
  }

  const shotsUsed = allCounts.reduce((total, count) => total + count, 0)
  const turnsRemaining = SALVO_TURNS - turnInCycle - 1
  const shotsRemaining = SALVO_TOTAL_SHOTS - shotsUsed
  const possibleMinimum = turnsRemaining * SALVO_MIN_PER_TURN
  const possibleMaximum = turnsRemaining * SALVO_MAX_PER_TURN
  if (shotsRemaining < possibleMinimum || shotsRemaining > possibleMaximum) {
    throw new Error('Salvo must total exactly five shots across three turns')
  }

  return cells.map((cell) => impact(cell, 'normal'))
}

const orthogonalCells = (center: FleetCell) => [
  center,
  { row: center.row - 1, column: center.column },
  { row: center.row, column: center.column + 1 },
  { row: center.row + 1, column: center.column },
  { row: center.row, column: center.column - 1 },
]

const scatterCornerCells = (center: FleetCell) => [
  { row: center.row - 1, column: center.column - 1 },
  { row: center.row - 1, column: center.column + 1 },
  { row: center.row + 1, column: center.column - 1 },
  { row: center.row + 1, column: center.column + 1 },
]

const assertBuckshotZone = (
  cells: readonly FleetCell[],
  center: FleetCell,
  zone: 'center' | 'outer',
) => {
  for (const cell of cells) {
    assertIntegerCell(cell)
    const rowDistance = Math.abs(cell.row - center.row)
    const columnDistance = Math.abs(cell.column - center.column)
    const maximumDistance = Math.max(rowDistance, columnDistance)
    const inZone = zone === 'center' ? maximumDistance <= 1 : maximumDistance === 2
    if (!inZone) {
      throw new Error(`Buckshot ${zone} outcome is outside its required zone`)
    }
  }
}

const planBuckshot = (plan: BuckshotNormalPlan | BuckshotSpreadPlan) => {
  assertBoardSize(plan.boardSize)
  if (plan.choice === 'normal') {
    assertIntegerCell(plan.cell)
    return [impact(plan.cell, 'normal')]
  }

  assertRangeCenter(plan.center, plan.boardSize)
  assertBuckshotZone(plan.centerCells, plan.center, 'center')
  assertBuckshotZone(plan.outerCells, plan.center, 'outer')
  const cells = [...plan.centerCells, ...plan.outerCells]
  if (new Set(cells.map(cellKey)).size !== 6) {
    throw new Error('One buckshot must contain six unique cells')
  }
  return cells.map((cell) => impact(cell, 'normal'))
}

export const planFleetShots = (plan: FleetShotPlan): FleetPlannedImpact[] => {
  switch (plan.type) {
    case 'normal':
      assertIntegerCell(plan.cell)
      return [impact(plan.cell, 'normal')]
    case 'salvo':
      return planSalvo(plan)
    case 'flare':
      return [
        impact(plan.normalCell, 'normal'),
        ...plan.flareCells.map((cell) => impact(cell, 'flare')),
      ]
    case 'tracer':
      return orthogonalCells(plan.center).map((cell, index) =>
        impact(cell, index === 0 ? 'normal' : 'flare'),
      )
    case 'explosive':
      assertRangeCenter(plan.center, plan.boardSize)
      if (plan.turnIndex % 2 !== 0) return [impact(plan.center, 'flare')]
      return orthogonalCells(plan.center).map((cell) => impact(cell, 'normal'))
    case 'scatter':
      assertRangeCenter(plan.center, plan.boardSize)
      if (plan.turnIndex % 2 !== 0) return [impact(plan.center, 'normal')]
      return [
        ...scatterCornerCells(plan.center).map((cell) => impact(cell, 'normal')),
        impact(plan.center, 'flare'),
      ]
    case 'piercing': {
      const [first, second] = plan.cells
      assertIntegerCell(first)
      assertIntegerCell(second)
      const distance = Math.abs(first.row - second.row) + Math.abs(first.column - second.column)
      if (distance !== 1) throw new Error('Piercing cells must be straight adjacent cells')
      return plan.cells.map((cell) => impact(cell, 'normal'))
    }
    case 'random':
      if (plan.randomCells.length < 1 || plan.randomCells.length > 2) {
        throw new Error('Random shot requires one or two caller-supplied cells')
      }
      if (
        plan.randomCells.some((cell) =>
          plan.alreadyHitCells.some((alreadyHit) => sameCell(cell, alreadyHit)),
        )
      ) {
        throw new Error('Random shot cannot use an already-hit cell')
      }
      return [
        impact(plan.normalCell, 'normal'),
        ...plan.randomCells.map((cell) => impact(cell, 'normal')),
      ]
    case 'buckshot':
      return planBuckshot(plan)
  }
}
