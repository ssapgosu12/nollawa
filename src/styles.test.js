import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('L3 CORRECTION: 참가자 격자 responsive 계약', () => {
  it('세로는 2열 3행이고 wide-tablet은 3열 2행이다', () => {
    expect(css).toMatch(/\.participant-grid\s*{[^}]*grid-template-rows:\s*repeat\(3,/s);
    expect(css).toMatch(/\.team-headings,\s*\.participant-grid\s*{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).toMatch(/@media\s*\(min-width:\s*850px\)[^{]*{[\s\S]*?\.participant-grid\s*{[^}]*grid-template-columns:\s*repeat\(3,[^}]*grid-template-rows:\s*repeat\(2,[^}]*grid-auto-flow:\s*column/);
  });
});
