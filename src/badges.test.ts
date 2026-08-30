import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkAndUnlockBadges, loadUnlockedBadges, resetBadges, ALL_BADGES } from './badges';
import type { GameStats, GameRecord } from './stats';

const emptyStats: GameStats = {
  played: 0, wins: 0, streak: 0, bestStreak: 0,
  bestTimeSec: null, bestMoves: null, bestScore: null,
};

const emptyHistory: GameRecord[] = [];

beforeEach(() => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
  };
  // vitest runs in Node, window may not exist
  if (typeof globalThis.window === 'undefined') {
    (globalThis as Record<string, unknown>).window = { localStorage: mockStorage };
  } else {
    vi.stubGlobal('localStorage', mockStorage);
  }
  resetBadges();
});

describe('badge system', () => {
  it('has 10 badges defined', () => {
    expect(ALL_BADGES.length).toBe(10);
  });

  it('unlocks first_win on first win', () => {
    const stats: GameStats = { ...emptyStats, played: 1, wins: 1, streak: 1, bestStreak: 1 };
    const newBadges = checkAndUnlockBadges(stats, emptyHistory);
    expect(newBadges).toContain('first_win');
  });

  it('unlocks streak_5', () => {
    const stats: GameStats = { ...emptyStats, played: 5, wins: 5, streak: 5, bestStreak: 5 };
    const newBadges = checkAndUnlockBadges(stats, emptyHistory);
    expect(newBadges).toContain('streak_5');
  });

  it('unlocks streak_10', () => {
    const stats: GameStats = { ...emptyStats, played: 10, wins: 10, streak: 10, bestStreak: 10 };
    const newBadges = checkAndUnlockBadges(stats, emptyHistory);
    expect(newBadges).toContain('streak_10');
  });

  it('unlocks speed_demon when time <= 300', () => {
    const stats: GameStats = { ...emptyStats, played: 1, wins: 1, streak: 1, bestStreak: 1, bestTimeSec: 250 };
    const newBadges = checkAndUnlockBadges(stats, emptyHistory);
    expect(newBadges).toContain('speed_demon');
  });

  it('unlocks quick_solve when moves <= 100', () => {
    const stats: GameStats = { ...emptyStats, played: 1, wins: 1, streak: 1, bestStreak: 1, bestMoves: 80 };
    const newBadges = checkAndUnlockBadges(stats, emptyHistory);
    expect(newBadges).toContain('quick_solve');
  });

  it('unlocks high_scorer when score >= 500', () => {
    const stats: GameStats = { ...emptyStats, played: 1, wins: 1, streak: 1, bestStreak: 1, bestScore: 500 };
    const newBadges = checkAndUnlockBadges(stats, emptyHistory);
    expect(newBadges).toContain('high_scorer');
  });

  it('unlocks games_10', () => {
    const stats: GameStats = { ...emptyStats, played: 10 };
    const newBadges = checkAndUnlockBadges(stats, emptyHistory);
    expect(newBadges).toContain('games_10');
  });

  it('unlocks games_50', () => {
    const stats: GameStats = { ...emptyStats, played: 50 };
    const newBadges = checkAndUnlockBadges(stats, emptyHistory);
    expect(newBadges).toContain('games_50');
  });

  it('persists unlocked badges', () => {
    const stats: GameStats = { ...emptyStats, played: 1, wins: 1, streak: 1, bestStreak: 1 };
    checkAndUnlockBadges(stats, emptyHistory);
    const unlocked = loadUnlockedBadges();
    expect(unlocked.has('first_win')).toBe(true);
  });

  it('does not re-unlock already unlocked badges', () => {
    const stats: GameStats = { ...emptyStats, played: 1, wins: 1, streak: 1, bestStreak: 1 };
    checkAndUnlockBadges(stats, emptyHistory);
    const second = checkAndUnlockBadges(stats, emptyHistory);
    expect(second.length).toBe(0);
  });

  it('resets badges', () => {
    const stats: GameStats = { ...emptyStats, played: 1, wins: 1, streak: 1, bestStreak: 1 };
    checkAndUnlockBadges(stats, emptyHistory);
    resetBadges();
    const unlocked = loadUnlockedBadges();
    expect(unlocked.size).toBe(0);
  });
});
