import type { GameState, GameRules, MoveEntry } from './types';
import type { DealDifficulty } from './engine';

export interface GameStats {
  played: number;
  wins: number;
  streak: number;
  bestStreak: number;
  bestTimeSec: number | null;
  bestMoves: number | null;
  bestScore: number | null;
}

export interface SavedGame {
  state: GameState;
  timer: number;
  seed: number | null;
  daily: boolean;
  moveLog?: MoveEntry[];
}

const STATS_KEY = 'solitaire-stats';
const SAVE_KEY = 'solitaire-save';
const DIFFICULTY_KEY = 'solitaire-difficulty';
const RULES_KEY = 'solitaire-rules';

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

function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function isValidCard(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  return (
    typeof o.suit === 'string' &&
    typeof o.rank === 'string' &&
    typeof o.faceUp === 'boolean' &&
    typeof o.id === 'string'
  );
}

function isValidState(s: unknown): s is GameState {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    Array.isArray(o.stock) && o.stock.every(isValidCard) &&
    Array.isArray(o.waste) && o.waste.every(isValidCard) &&
    Array.isArray(o.foundations) && o.foundations.length === 4 &&
    (o.foundations as unknown[]).every(f => Array.isArray(f) && (f as unknown[]).every(isValidCard)) &&
    Array.isArray(o.tableau) && o.tableau.length === 7 &&
    (o.tableau as unknown[]).every(p => Array.isArray(p) && (p as unknown[]).every(isValidCard)) &&
    Array.isArray(o.foundationSuits) && o.foundationSuits.length === 4 &&
    typeof o.moves === 'number' &&
    typeof o.won === 'boolean'
  );
}

export function loadStats(): GameStats {
  const d = readJson(STATS_KEY) as Partial<GameStats> | null;
  return {
    played: typeof d?.played === 'number' ? d.played : 0,
    wins: typeof d?.wins === 'number' ? d.wins : 0,
    streak: typeof d?.streak === 'number' ? d.streak : 0,
    bestStreak: typeof d?.bestStreak === 'number' ? d.bestStreak : 0,
    bestTimeSec: typeof d?.bestTimeSec === 'number' ? d.bestTimeSec : null,
    bestMoves: typeof d?.bestMoves === 'number' ? d.bestMoves : null,
    bestScore: typeof d?.bestScore === 'number' ? d.bestScore : null,
  };
}

export function saveStats(stats: GameStats): void {
  writeJson(STATS_KEY, stats);
}

export function resetStats(): GameStats {
  const cleared: GameStats = {
    played: 0,
    wins: 0,
    streak: 0,
    bestStreak: 0,
    bestTimeSec: null,
    bestMoves: null,
    bestScore: null,
  };
  saveStats(cleared);
  return cleared;
}

export function applyWin(stats: GameStats, moves: number, timeSec: number, score: number): GameStats {
  const next: GameStats = {
    played: stats.played + 1,
    wins: stats.wins + 1,
    streak: stats.streak + 1,
    bestStreak: Math.max(stats.bestStreak, stats.streak + 1),
    bestTimeSec:
      stats.bestTimeSec === null ? timeSec : Math.min(stats.bestTimeSec, timeSec),
    bestMoves:
      stats.bestMoves === null ? moves : Math.min(stats.bestMoves, moves),
    bestScore:
      stats.bestScore === null ? score : Math.max(stats.bestScore, score),
  };
  saveStats(next);
  return next;
}

export function applyLoss(stats: GameStats): GameStats {
  const next: GameStats = { ...stats, played: stats.played + 1, streak: 0 };
  saveStats(next);
  return next;
}

export function loadSavedGame(): SavedGame | null {
  const d = readJson(SAVE_KEY) as Partial<SavedGame> | null;
  if (!d || !isValidState(d.state) || typeof d.timer !== 'number') return null;
  if (d.state.won) return null;
  return {
    state: d.state,
    timer: d.timer,
    seed: typeof d.seed === 'number' ? d.seed : null,
    daily: d.daily === true,
    moveLog: Array.isArray(d.moveLog) ? d.moveLog : undefined,
  };
}

export function saveGame(state: GameState, timer: number, seed: number | null, daily: boolean, moveLog?: MoveEntry[]): void {
  writeJson(SAVE_KEY, { state, timer, seed, daily, moveLog });
}

export function clearSavedGame(): void {
  removeKey(SAVE_KEY);
}

export function loadDifficulty(): DealDifficulty {
  const v = readJson(DIFFICULTY_KEY);
  return v === 'easy' || v === 'hard' ? v : 'normal';
}

export function saveDifficulty(d: DealDifficulty): void {
  writeJson(DIFFICULTY_KEY, d);
}

export type Theme = 'green' | 'dark';

const THEME_KEY = 'solitaire-theme';

export function loadTheme(): Theme {
  const v = readJson(THEME_KEY);
  return v === 'dark' ? 'dark' : 'green';
}

export function saveTheme(t: Theme): void {
  writeJson(THEME_KEY, t);
}

export function loadRules(): GameRules {
  const d = readJson(RULES_KEY) as Partial<GameRules> | null;
  return {
    drawCount: d?.drawCount === 3 ? 3 : 1,
    maxRecycles:
      d?.maxRecycles === 1 || d?.maxRecycles === 3 ? d.maxRecycles : -1,
    scoring: d?.scoring === 'vegas' ? 'vegas' : 'standard',
  };
}

export function saveRules(r: GameRules): void {
  writeJson(RULES_KEY, r);
}

export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dailySeed(date: Date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

const DAILY_PREFIX = 'solitaire-daily-';

export function isDailyCleared(key: string): boolean {
  try {
    return window.localStorage.getItem(DAILY_PREFIX + key) === '1';
  } catch {
    return false;
  }
}

export function markDailyCleared(key: string): void {
  try {
    window.localStorage.setItem(DAILY_PREFIX + key, '1');
  } catch {
    // ignore
  }
}

export function countClearedDailies(): number {
  let count = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(DAILY_PREFIX)) count++;
    }
  } catch {
    // ignore
  }
  return count;
}

export interface GameRecord {
  won: boolean;
  moves: number;
  timeSec: number;
  score: number;
  date: string;
}

const HISTORY_KEY = 'solitaire-history';
const HISTORY_MAX = 50;

export function loadGameHistory(): GameRecord[] {
  const d = readJson(HISTORY_KEY);
  if (!Array.isArray(d)) return [];
  return d.filter((r): r is GameRecord =>
    r !== null && typeof r === 'object' &&
    typeof (r as GameRecord).won === 'boolean' &&
    typeof (r as GameRecord).moves === 'number' &&
    typeof (r as GameRecord).date === 'string'
  );
}

export function pushGameHistory(record: GameRecord): GameRecord[] {
  const history = loadGameHistory();
  history.push(record);
  const trimmed = history.slice(-HISTORY_MAX);
  writeJson(HISTORY_KEY, trimmed);
  return trimmed;
}

export function resetGameHistory(): void {
  removeKey(HISTORY_KEY);
}
