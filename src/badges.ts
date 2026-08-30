import type { GameStats, GameRecord } from './stats';

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export const ALL_BADGES: Badge[] = [
  { id: 'first_win', name: '初勝利', emoji: '🏆', description: '1回勝利する' },
  { id: 'streak_5', name: '連勝5', emoji: '🔥', description: '5連勝を達成する' },
  { id: 'streak_10', name: '連勝10', emoji: '💥', description: '10連勝を達成する' },
  { id: 'speed_demon', name: 'スピードデーモン', emoji: '⚡', description: '5分以内にクリアする' },
  { id: 'quick_solve', name: 'クイックソルバー', emoji: '🎯', description: '100手以内にクリアする' },
  { id: 'high_scorer', name: 'ハイスコアラー', emoji: '💎', description: 'スコア500以上でクリアする' },
  { id: 'daily_3', name: 'デイリーマスター', emoji: '📅', description: 'デイリーを3回クリアする' },
  { id: 'daily_7', name: 'デイリーlegend', emoji: '🌟', description: 'デイリーを7回クリアする' },
  { id: 'games_10', name: 'ベテラン', emoji: '🎖️', description: '10回以上プレイする' },
  { id: 'games_50', name: 'ソリティアマスター', emoji: '👑', description: '50回以上プレイする' },
];

const BADGES_KEY = 'solitaire-badges';

export function loadUnlockedBadges(): Set<string> {
  try {
    const raw = window.localStorage.getItem(BADGES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((v): v is string => typeof v === 'string'));
    return new Set();
  } catch {
    return new Set();
  }
}

function saveUnlockedBadges(badges: Set<string>): void {
  try {
    window.localStorage.setItem(BADGES_KEY, JSON.stringify([...badges]));
  } catch {
    // ignore
  }
}

export function checkAndUnlockBadges(
  stats: GameStats,
  history: GameRecord[]
): string[] {
  const unlocked = loadUnlockedBadges();
  const newlyUnlocked: string[] = [];

  const tryUnlock = (id: string) => {
    if (!unlocked.has(id)) {
      unlocked.add(id);
      newlyUnlocked.push(id);
    }
  };

  if (stats.wins >= 1) tryUnlock('first_win');
  if (stats.bestStreak >= 5) tryUnlock('streak_5');
  if (stats.bestStreak >= 10) tryUnlock('streak_10');
  if (stats.bestTimeSec !== null && stats.bestTimeSec <= 300) tryUnlock('speed_demon');
  if (stats.bestMoves !== null && stats.bestMoves <= 100) tryUnlock('quick_solve');
  if (stats.bestScore !== null && stats.bestScore >= 500) tryUnlock('high_scorer');
  if (stats.played >= 10) tryUnlock('games_10');
  if (stats.played >= 50) tryUnlock('games_50');

  const dailyWins = history.filter(r => r.won && r.date.length === 10).length;
  if (dailyWins >= 3) tryUnlock('daily_3');
  if (dailyWins >= 7) tryUnlock('daily_7');

  if (newlyUnlocked.length > 0) {
    saveUnlockedBadges(unlocked);
  }

  return newlyUnlocked;
}

export function resetBadges(): void {
  try {
    window.localStorage.removeItem(BADGES_KEY);
  } catch {
    // ignore
  }
}
