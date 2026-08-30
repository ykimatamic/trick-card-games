import { describe, expect, it, beforeEach } from 'vitest';
import {
  applyResult,
  loadStats,
  recordResult,
  winRate,
  saveChips,
  loadChips,
  hasStats,
} from './gameStats';

// テスト用のメモリ localStorage スタブ
function installLocalStorage(): void {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as Record<string, unknown>).window = { localStorage: ls };
}

beforeEach(() => installLocalStorage());

describe('gameStats: applyResult(純粋関数)', () => {
  it('初回勝ちで played/wins/streak が増える', () => {
    const base = { played: 0, wins: 0, streak: 0, bestStreak: 0 };
    const r = applyResult(base, true);
    expect(r).toEqual({ played: 1, wins: 1, streak: 1, bestStreak: 1 });
  });

  it('負けで streak が0にリセットされ wins は増えない', () => {
    const base = { played: 5, wins: 3, streak: 2, bestStreak: 2 };
    const r = applyResult(base, false);
    expect(r).toEqual({ played: 6, wins: 3, streak: 0, bestStreak: 2 });
  });

  it('連勝で bestStreak が更新される', () => {
    let s = { played: 0, wins: 0, streak: 0, bestStreak: 0 };
    s = applyResult(s, true);
    s = applyResult(s, true);
    s = applyResult(s, false);
    s = applyResult(s, false);
    s = applyResult(s, true);
    s = applyResult(s, true);
    s = applyResult(s, true);
    expect(s.played).toBe(7);
    expect(s.wins).toBe(5);
    expect(s.streak).toBe(3);
    expect(s.bestStreak).toBe(3);
  });

  it('winRate は整数%を返す', () => {
    expect(winRate({ played: 0, wins: 0, streak: 0, bestStreak: 0 })).toBe(0);
    const s = applyResult(applyResult({ played: 0, wins: 0, streak: 0, bestStreak: 0 }, true), true);
    expect(winRate(s)).toBe(100);
    expect(winRate({ played: 3, wins: 1, streak: 0, bestStreak: 1 })).toBe(33);
  });
});

describe('gameStats: localStorage 永続化', () => {
  it('recordResult が loadStats で読み戻せる(ゲームID別キー)', () => {
    expect(loadStats('poker')).toEqual({ played: 0, wins: 0, streak: 0, bestStreak: 0 });
    recordResult('poker', true);
    expect(loadStats('poker')).toEqual({ played: 1, wins: 1, streak: 1, bestStreak: 1 });
  });

  it('ゲームIDごとに独立して記録される', () => {
    recordResult('poker', true);
    recordResult('poker', false);
    recordResult('doubt', true);
    expect(loadStats('poker')).toEqual({ played: 2, wins: 1, streak: 0, bestStreak: 1 });
    expect(loadStats('doubt')).toEqual({ played: 1, wins: 1, streak: 1, bestStreak: 1 });
  });

  it('hasStats は記録がなければ false', () => {
    expect(hasStats('memory')).toBe(false);
    recordResult('memory', true);
    expect(hasStats('memory')).toBe(true);
  });

  it('壊れた保存データは空として扱う', () => {
    (globalThis as Record<string, unknown>).window = {
      localStorage: { getItem: () => 'not json{{', setItem: () => undefined },
    };
    expect(loadStats('poker')).toEqual({ played: 0, wins: 0, streak: 0, bestStreak: 0 });
    expect(loadChips('poker')).toBeNull();
  });
});

describe('gameStats: チップ永続化', () => {
  it('saveChips / loadChips で往復できる', () => {
    expect(loadChips('poker')).toBeNull();
    saveChips('poker', 470);
    expect(loadChips('poker')).toBe(470);
  });

  it('ゲームID別・負の値は0に丸める', () => {
    saveChips('blackjack', 900);
    saveChips('poker', -50);
    expect(loadChips('blackjack')).toBe(900);
    expect(loadChips('poker')).toBe(0);
  });
});
