import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'vite';
const roots = ['src', 'public'];
const files = ['index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'];
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
export const buildInputs = (base = '.') => [...files.map((file) => join(base, file)), ...roots.flatMap((root) => walk(join(base, root)))].sort();
export const buildFingerprint = (base = '.') => { const digest = createHash('sha256'); for (const file of buildInputs(base)) digest.update(relative(base, file)).update('\0').update(readFileSync(file)).update('\0'); return digest.digest('hex').slice(0, 12); };
export const buildHash = (base = '.') => process.env.BUILD_HASH ?? buildFingerprint(base);
export default defineConfig({
  base: './',
  define: { __BUILD_HASH__: JSON.stringify(buildHash()) },
  worker: { format: 'iife' },
});
