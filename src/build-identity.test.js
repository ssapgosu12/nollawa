import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFingerprint, buildHash, buildInputs } from '../vite.config.ts';

const rootFiles = ['index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'];
let fixture;

beforeEach(() => {
  fixture = mkdtempSync(join(process.cwd(), '.tmp-build-id-'));
  mkdirSync(join(fixture, 'src', 'nested'), { recursive: true });
  mkdirSync(join(fixture, 'public'), { recursive: true });
  for (const file of rootFiles) writeFileSync(join(fixture, file), file);
  writeFileSync(join(fixture, 'src', 'main.tsx'), 'app');
  writeFileSync(join(fixture, 'src', 'nested', 'view.tsx'), 'view');
  writeFileSync(join(fixture, 'public', 'sw.js'), 'worker');
});

afterEach(() => rmSync(fixture, { recursive: true, force: true }));

describe('build identity invariant', () => {
  it('uses the documented complete working-tree input set', () => {
    const paths = buildInputs(fixture).map((file) => relative(fixture, file).replaceAll('\\', '/'));
    expect(paths).toEqual([...rootFiles, 'public/sw.js', 'src/main.tsx', 'src/nested/view.tsx'].sort());
  });

  it('changes for covered bytes but ignores metadata and excluded state', () => {
    const initial = buildFingerprint(fixture);
    writeFileSync(join(fixture, 'unrelated.txt'), 'ignored');
    mkdirSync(join(fixture, '.git'));
    writeFileSync(join(fixture, '.git', 'HEAD'), 'first');
    utimesSync(join(fixture, 'src', 'main.tsx'), new Date(0), new Date(0));
    expect(buildFingerprint(fixture)).toBe(initial);
    writeFileSync(join(fixture, '.git', 'HEAD'), 'second');
    expect(buildFingerprint(fixture)).toBe(initial);
    writeFileSync(join(fixture, 'src', 'main.tsx'), 'changed');
    expect(buildFingerprint(fixture)).not.toBe(initial);
  });

  it('preserves the explicit BUILD_HASH override', () => {
    const saved = process.env.BUILD_HASH;
    process.env.BUILD_HASH = 'manual-build';
    expect(buildHash(fixture)).toBe('manual-build');
    if (saved === undefined) delete process.env.BUILD_HASH;
    else process.env.BUILD_HASH = saved;
    expect(buildHash(fixture)).toBe(buildFingerprint(fixture));
    expect(readFileSync(join(fixture, 'vite.config.ts'), 'utf8')).toBe('vite.config.ts');
  });
});
