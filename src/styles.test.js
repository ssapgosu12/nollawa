import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const board = readFileSync(new URL('./components/Board.tsx', import.meta.url), 'utf8');

describe('L3 CORRECTION: 참가자 격자 responsive 계약', () => {
  it('화면 폭과 무관하게 2열 3행이다 — 왼쪽/오른쪽 열이 곧 팀이므로 열 수를 바꿀 수 없다', () => {
    expect(css).toMatch(/\.participant-grid\s*{[^}]*grid-template-rows:\s*repeat\(3,/s);
    expect(css).toMatch(/\.team-headings,\s*\.participant-grid\s*{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).not.toMatch(/\.participant-grid\s*{[^}]*grid-template-columns:\s*repeat\(3,/s);
    expect(css).not.toMatch(/\.participant-grid\s*{[^}]*grid-auto-flow:\s*column/s);
  });
});

describe('N3: 넓은 화면의 bounded 참가자 카드와 메뉴 흐름', () => {
  it('2x3 행은 상한이 있고 위 정렬되며 details control은 absolute가 아니다', () => {
    expect(css).toMatch(/\.participant-grid\s*{[^}]*grid-template-rows:\s*repeat\(3,\s*minmax\(86px,\s*112px\)\)[^}]*align-content:\s*start/s);
    expect(css).toMatch(/\.participant\s*{[^}]*max-height:\s*112px/s);
    expect(css).toMatch(/\.participant details\s*{[^}]*margin-top:/s);
    expect(css).not.toMatch(/\.participant details\s*{[^}]*position:\s*absolute/s);
  });
});

describe('L6 TEAM VOTE: 열 아래 dot과 CSS player 변수', () => {
  it('board 아래 영역에 표 수만큼 dot을 만들고 내 표는 기존 player CSS 변수만 쓴다', () => {
    expect(board).toMatch(/viewBox="0 0 700 650"/);
    expect(board).toMatch(/length:\s*dots\[column\]\?\.count[\s\S]*cy="625"/);
    expect(board).toMatch(/own-vote player-\$\{seat\}/);
    expect(css).toMatch(/\.vote-dot\.own-vote\.player-1\s*{\s*fill:\s*var\(--player-1\)/);
    expect(css).toMatch(/\.vote-dot\.own-vote\.player-2\s*{\s*fill:\s*var\(--player-2\)/);
  });
});

describe('R2: 못 누르는 버튼은 강조되지 않는다', () => {
  it('button:disabled가 강조 배경을 되돌린다 — primary 클래스가 붙은 버튼도 포함', () => {
    expect(css).toMatch(/button:disabled\s*{[^}]*background:/);
  });
});
