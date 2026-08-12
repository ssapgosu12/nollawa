import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const board = readFileSync(new URL('./components/Board.tsx', import.meta.url), 'utf8');

describe('L3 CORRECTION: 참가자 격자 responsive 계약', () => {
  it('세로는 2열 3행이고 wide-tablet은 3열 2행이다', () => {
    expect(css).toMatch(/\.participant-grid\s*{[^}]*grid-template-rows:\s*repeat\(3,/s);
    expect(css).toMatch(/\.team-headings,\s*\.participant-grid\s*{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).toMatch(/@media\s*\(min-width:\s*850px\)[^{]*{[\s\S]*?\.participant-grid\s*{[^}]*grid-template-columns:\s*repeat\(3,[^}]*grid-template-rows:\s*repeat\(2,[^}]*grid-auto-flow:\s*column/);
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
