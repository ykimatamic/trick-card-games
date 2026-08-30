import { dealSolvableState } from './engine';
import type { DealDifficulty } from './engine';

interface DealRequest {
  id: number;
  difficulty: DealDifficulty;
  seed?: number;
}

self.onmessage = (e: MessageEvent<DealRequest>) => {
  const { id, difficulty, seed } = e.data;
  try {
    const dealt = dealSolvableState({
      difficulty,
      ...(seed !== undefined ? { seed } : {}),
    });
    (self as unknown as Worker).postMessage({
      id,
      state: dealt.state,
      proven: dealt.proven,
    });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
