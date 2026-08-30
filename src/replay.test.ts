import { describe, it, expect } from 'vitest';
import { encodeReplay, decodeReplay } from './replay';
import type { MoveEntry } from './types';

describe('replay encode/decode', () => {
  it('roundtrips empty moves', () => {
    const data = { seed: 12345, moves: [] };
    const encoded = encodeReplay(data);
    const decoded = decodeReplay(encoded);
    expect(decoded).toEqual(data);
  });

  it('roundtrips moves', () => {
    const moves: MoveEntry[] = [
      { t: 'm', src: 'tableau', si: 0, dst: 'foundation', di: 1, n: 1 },
      { t: 's' },
      { t: 'u' },
    ];
    const data = { seed: 99999, moves };
    const encoded = encodeReplay(data);
    const decoded = decodeReplay(encoded);
    expect(decoded).toEqual(data);
  });

  it('roundtrips with rules', () => {
    const moves: MoveEntry[] = [
      { t: 'm', src: 'waste', si: 0, dst: 'tableau', di: 3, n: 1 },
    ];
    const data = {
      seed: 42,
      rules: { drawCount: 3 as const, maxRecycles: 1, scoring: 'vegas' as const },
      moves,
    };
    const encoded = encodeReplay(data);
    const decoded = decodeReplay(encoded);
    expect(decoded).toEqual(data);
  });

  it('returns null for invalid base64', () => {
    expect(decodeReplay('!!!invalid!!!')).toBeNull();
  });

  it('returns null for missing seed', () => {
    const encoded = btoa(JSON.stringify({ m: [] }));
    expect(decodeReplay(encoded)).toBeNull();
  });

  it('roundtrips complex move sequence', () => {
    const moves: MoveEntry[] = [
      { t: 'm', src: 'tableau', si: 2, dst: 'foundation', di: 0, n: 1 },
      { t: 'm', src: 'waste', si: 0, dst: 'tableau', di: 5, n: 3 },
      { t: 's' },
      { t: 'u' },
      { t: 'm', src: 'foundation', si: 1, dst: 'tableau', di: 3, n: 1 },
    ];
    const data = { seed: 42, moves };
    const encoded = encodeReplay(data);
    const decoded = decodeReplay(encoded);
    expect(decoded).toEqual(data);
  });
});
