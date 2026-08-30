/**
 * 対戦型カードゲーム共通の「勝敗記録」と「チップ永続化」。
 *
 * ソリティア専用の stats.ts とは分離し、ゲームIDをキーに持つ
 * localStorage へ保存する(`{gameId}-stats` / `{gameId}-chips`)。
 * ゲーム定義(`TurnGameDef.id`)ごとに独立して記録される。
 */

export interface WinStats {
  played: number;
  wins: number;
  streak: number;
  bestStreak: number;
}

function statsKey(gameId: string): string {
  return `${gameId}-stats`;
}

function chipsKey(gameId: string): string {
  return `${gameId}-chips`;
}

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ストレージ利用不可(プライベートモード等)では静かに無視
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 純粋関数: 1対局分の結果を戦績に反映する(勝ち=won)。テスト対象 */
export function applyResult(stats: WinStats, won: boolean): WinStats {
  const played = stats.played + 1;
  const streak = won ? stats.streak + 1 : 0;
  return {
    played,
    wins: stats.wins + (won ? 1 : 0),
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
  };
}

export function loadStats(gameId: string): WinStats {
  const d = readJson(statsKey(gameId)) as Partial<WinStats> | null;
  return {
    played: num(d?.played),
    wins: num(d?.wins),
    streak: num(d?.streak),
    bestStreak: num(d?.bestStreak),
  };
}

export function recordResult(gameId: string, won: boolean): WinStats {
  const next = applyResult(loadStats(gameId), won);
  writeJson(statsKey(gameId), next);
  return next;
}

export function hasStats(gameId: string): boolean {
  try {
    const raw = window.localStorage.getItem(statsKey(gameId));
    return raw !== null;
  } catch {
    return false;
  }
}

/** 勝利率(%int) */
export function winRate(stats: WinStats): number {
  return stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
}

/** チップ残高の永続化(ポーカー/ブラックジャック用) */
export function loadChips(gameId: string): number | null {
  const v = readJson(chipsKey(gameId));
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

export function saveChips(gameId: string, chips: number): void {
  writeJson(chipsKey(gameId), Math.max(0, Math.round(chips)));
}
