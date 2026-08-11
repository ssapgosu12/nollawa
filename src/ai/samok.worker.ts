import { chooseSamokMove } from './samok-ai';
import type { SamokState } from '../game/samok';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<SamokState>) => void) | null;
  postMessage(message: unknown): void;
};

workerScope.onmessage = (event) => {
  workerScope.postMessage({ column: chooseSamokMove(event.data) });
};
