import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

const hash = process.env.BUILD_HASH ?? execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
export default defineConfig({
  base: './',
  define: { __BUILD_HASH__: JSON.stringify(hash) },
  worker: { format: 'iife' },
});
