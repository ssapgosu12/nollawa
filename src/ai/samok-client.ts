import { legalColumns, type SamokState } from '../game/samok';
import { greedySamokMove } from './samok-ai';
const TIMEOUT_MS = 800;
export function requestSamokMove(state: SamokState): Promise<number | null> {
  const fallback = greedySamokMove(state);
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./samok.worker.ts', import.meta.url));
    let settled = false;
    const finish = (column: number | null) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(column !== null && legalColumns(state).includes(column) ? column : fallback);
    };
    const timer = window.setTimeout(() => finish(fallback), TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<{ column: number | null }>) => {
      window.clearTimeout(timer);
      finish(event.data.column);
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      finish(fallback);
    };
    worker.postMessage(state);
  });
}
