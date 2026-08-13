import { describe, expect, it, vi } from 'vitest';
import { samok } from '../game/samok';
import { Board } from './Board';
import { BOARD_GEOMETRIES, GridBoard, Stone, gridMetrics, snapCellPixels, stoneDitherEnabled } from './BoardGrid';

describe('공용 SVG 격자·교점 렌더러', () => {
  it('모집단 4/4의 서로 다른 판 기하를 한 매개변수 집합으로 표현한다', () => {
    expect(BOARD_GEOMETRIES).toEqual({
      samok: { rows: 6, columns: 7, layout: 'slots', footer: 50 },
      omok: { rows: 15, columns: 15, layout: 'intersections' },
      yukmok: { rows: 19, columns: 19, layout: 'intersections' },
      reversi: { rows: 8, columns: 8, layout: 'cells' },
    });
    expect(gridMetrics(BOARD_GEOMETRIES.samok)).toEqual({ width: 700, boardHeight: 600, height: 650 });
  });

  it('기존 사목 Board가 공용 원시 컴포넌트를 실제 루트로 소비한다', () => {
    const node = Board({ state: samok.init(), onDrop: vi.fn() });
    expect(node.type).toBe(GridBoard);
    expect(node.props.geometry).toBe(BOARD_GEOMETRIES.samok);
    expect(node.props.columnInput).toBe(true);
    expect(node.props.flipRows).toBe(true);
  });

  it.each(['omok', 'yukmok', 'reversi'] as const)('%s 판을 복제 렌더러 없이 생성한다', (name) => {
    const geometry = BOARD_GEOMETRIES[name];
    const board = Array.from({ length: geometry.rows }, () => Array(geometry.columns).fill(0));
    const node = GridBoard({ geometry, board, label: name, cellPixels: snapCellPixels(389, geometry.columns), isLegal: () => true, onSelect: vi.fn(), selectionLabel: () => name, renderCell: () => null });
    expect(node.type).toBe('svg');
    expect(node.props['data-grid']).toBe(`${geometry.columns}x${geometry.rows}`);
    expect(node.props['data-layout']).toBe(geometry.layout);
  });

  it('정수 셀 스냅과 26px 디더 임계를 고정하고 돌은 CSS 색 변수만 쓴다', () => {
    expect(snapCellPixels(389, 15)).toBe(25);
    expect(stoneDitherEnabled(25)).toBe(false);
    expect(stoneDitherEnabled(26)).toBe(true);
    const plain = Stone({ seat: 2, cx: 50, cy: 50, diameterPixels: 25 });
    const dithered = Stone({ seat: 1, cx: 50, cy: 50, diameterPixels: 26 });
    expect(plain.props.children).toHaveLength(3);
    expect(dithered.props.children).toHaveLength(3);
    expect(JSON.stringify(dithered.props)).toContain('var(--ink)');
    expect(JSON.stringify(dithered.props)).toContain('url(#board-dither-light)');
  });
});
