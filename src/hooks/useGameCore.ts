import { useState, useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { GameState, GameRules, MoveEntry } from '../types';
import { DEFAULT_RULES } from '../types';
import { createDeck, dealCards, flipFromStock } from '../game';
import { dealSolvableState } from '../engine';
import type { DealDifficulty } from '../engine';
import * as snd from '../sound';
import {
  loadStats,
  applyWin,
  applyLoss,
  resetStats,
  loadSavedGame,
  saveGame,
  clearSavedGame,
  loadDifficulty,
  loadTheme,
  loadRules,
  saveRules,
  saveTheme,
  todayKey,
  dailySeed,
  isDailyCleared,
  markDailyCleared,
  pushGameHistory,
  loadGameHistory,
} from '../stats';
import type { GameStats, GameRecord, Theme } from '../stats';
import { checkAndUnlockBadges, loadUnlockedBadges, resetBadges } from '../badges';
import { readReplayFromUrl } from '../replay';

type VTDocument = Document & {
  startViewTransition?: (callback: () => void) => void;
};

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const HISTORY_MAX = 400;
const WIN_MODAL_DELAY_MS = 1400;

export interface UseGameCoreReturn {
  gameState: GameState;
  gameStateRef: React.MutableRefObject<GameState>;
  history: GameState[];
  isDealing: boolean;
  isGameOver: boolean;
  showWinModal: boolean;
  difficulty: DealDifficulty;
  stats: GameStats;
  showStats: boolean;
  theme: Theme;
  soundOn: boolean;
  settings: GameRules;
  showSettings: boolean;
  gameSeed: number | null;
  isDaily: boolean;
  dailyCleared: boolean;
  gameHistory: GameRecord[];
  unlockedBadges: Set<string>;
  newBadge: string | null;
  seedInput: string;
  autoStatus: string | null;
  isRunning: boolean;
  timerRef: React.MutableRefObject<number>;
  commit: (next: GameState, animate?: boolean, record?: boolean) => void;
  setDifficulty: (d: DealDifficulty) => void;
  setStats: (s: GameStats) => void;
  setShowStats: (v: boolean) => void;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
  setSoundOn: (v: boolean) => void;
  setSettings: React.Dispatch<React.SetStateAction<GameRules>>;
  setShowSettings: (v: boolean) => void;
  setSeedInput: (v: string) => void;
  setAutoStatus: (v: string | null) => void;
  setIsRunning: (v: boolean) => void;
  handleUndo: () => void;
  handleStockClick: () => void;
  startGame: (opts: {
    difficulty: DealDifficulty;
    rules: GameRules;
    seed?: number;
    daily?: boolean;
  }) => void;
  handleNewGame: () => void;
  handleDailyGame: () => void;
  handleSeedStart: () => void;
  handleResetStats: () => void;
  handleSoundToggle: () => void;
  handleThemeToggle: () => void;
  updateRules: (patch: Partial<GameRules>) => void;
  logMove: (entry: MoveEntry) => void;
  exportMoveLog: () => void;
  importMoveLog: (file: File) => Promise<boolean>;
}

export function useGameCore(): UseGameCoreReturn {
  const [gameState, setGameState] = useState<GameState>(() => dealCards(createDeck()));
  const gameStateRef = useRef(gameState);
  const dealTimeoutRef = useRef<number | null>(null);
  const dealWorkerRef = useRef<Worker | null>(null);
  const dealReqIdRef = useRef(0);
  const dealGenRef = useRef(0);
  const winRecordedRef = useRef(false);
  const gameSeedRef = useRef<number | null>(null);
  const isDailyRef = useRef(false);
  const timerRef = useRef(0);
  const winRecordEffectRef = useRef(false);
  const moveLogRef = useRef<MoveEntry[]>([]);
  const [history, setHistory] = useState<GameState[]>([]);
  const [isDealing, setIsDealing] = useState(true);
  const [isGameOver, setIsGameOver] = useState(false);
  const [showWinModal, setShowWinModal] = useState(false);
  const [difficulty, setDifficulty] = useState<DealDifficulty>(() => loadDifficulty());
  const [stats, setStats] = useState<GameStats>(() => loadStats());
  const [showStats, setShowStats] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [soundOn, setSoundOn] = useState(() => !snd.isMuted());
  const [settings, setSettings] = useState<GameRules>(() => loadRules());
  const [showSettings, setShowSettings] = useState(false);
  const [gameSeed, setGameSeed] = useState<number | null>(null);
  const [isDaily, setIsDaily] = useState(false);
  const [dailyCleared, setDailyCleared] = useState(() => isDailyCleared(todayKey()));
  const [gameHistory, setGameHistory] = useState<GameRecord[]>(() => loadGameHistory());
  const [unlockedBadges, setUnlockedBadges] = useState<Set<string>>(() => loadUnlockedBadges());
  const [newBadge, setNewBadge] = useState<string | null>(null);
  const [seedInput, setSeedInput] = useState('');
  const [autoStatus, setAutoStatus] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(true);

  const commit = useCallback((next: GameState, animate = true, record = true) => {
    if (record) {
      setHistory(h => {
        const nh = [...h, gameStateRef.current];
        return nh.length > HISTORY_MAX ? nh.slice(nh.length - HISTORY_MAX) : nh;
      });
    }
    gameStateRef.current = next;
    const vt = (document as VTDocument).startViewTransition;
    if (animate && !prefersReducedMotion() && typeof vt === 'function') {
      vt.call(document, () => {
        flushSync(() => {
          setGameState(next);
        });
      });
    } else {
      setGameState(next);
    }
  }, []);

  const logMove = useCallback((entry: MoveEntry) => {
    moveLogRef.current.push(entry);
  }, []);

  const ensureDealWorker = useCallback((): Worker => {
    if (!dealWorkerRef.current) {
      dealWorkerRef.current = new Worker(new URL('../dealWorker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return dealWorkerRef.current;
  }, []);

  const requestDeal = useCallback((diff: DealDifficulty, seed?: number): Promise<GameState> => {
    return new Promise((resolve, reject) => {
      let w: Worker;
      try {
        w = ensureDealWorker();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const id = ++dealReqIdRef.current;
      const onMsg = (ev: MessageEvent) => {
        const d = ev.data as { id?: number; state?: GameState; error?: string };
        if (!d || d.id !== id) return;
        w.removeEventListener('message', onMsg);
        if (d.error || !d.state) reject(new Error(d.error ?? 'deal failed'));
        else resolve(d.state);
      };
      w.addEventListener('message', onMsg);
      try {
        w.postMessage({ id, difficulty: diff, ...(seed !== undefined ? { seed } : {}) });
      } catch (err) {
        w.removeEventListener('message', onMsg);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }, [ensureDealWorker]);

  useEffect(
    () => () => {
      dealWorkerRef.current?.terminate();
      dealWorkerRef.current = null;
    },
    []
  );

  useEffect(() => {
    const replay = readReplayFromUrl();
    if (replay) {
      dealTimeoutRef.current = window.setTimeout(() => {
        gameSeedRef.current = replay.seed;
        if (replay.rules) {
          setSettings(replay.rules);
          saveRules(replay.rules);
        }
        setGameSeed(replay.seed);
        const gen = ++dealGenRef.current;
        requestDeal(loadDifficulty(), replay.seed)
          .then(state => {
            if (gen !== dealGenRef.current) return;
            commit(state, false, false);
            setIsDealing(false);
            window.history.replaceState({}, '', window.location.pathname);
          })
          .catch(() => {
            if (gen !== dealGenRef.current) return;
            window.history.replaceState({}, '', window.location.pathname);
            const dealt = dealSolvableState({ difficulty: loadDifficulty() });
            commit({ ...dealt.state, rules: loadRules() }, false, false);
            setIsDealing(false);
          });
      }, 0);
      return () => {
        if (dealTimeoutRef.current !== null) window.clearTimeout(dealTimeoutRef.current);
      };
    }

    const saved = loadSavedGame();
    if (saved && !saved.state.won) {
      dealTimeoutRef.current = window.setTimeout(() => {
        const restored: GameState = {
          ...saved.state,
          score: typeof saved.state.score === 'number' ? saved.state.score : 0,
          recycles: typeof saved.state.recycles === 'number' ? saved.state.recycles : 0,
          rules: { ...DEFAULT_RULES, ...(saved.state.rules ?? {}) },
        };
        gameSeedRef.current = saved.seed;
        isDailyRef.current = saved.daily;
        setGameSeed(saved.seed);
        setIsDaily(saved.daily);
        commit(restored, false, false);
        moveLogRef.current = saved.moveLog ?? [];
        timerRef.current = saved.timer;
        setIsRunning(true);
        setIsDealing(false);
      }, 0);
      return () => {
        if (dealTimeoutRef.current !== null) window.clearTimeout(dealTimeoutRef.current);
      };
    }

    const gen = ++dealGenRef.current;
    requestDeal(loadDifficulty())
      .then(state => {
        if (gen !== dealGenRef.current) return;
        gameSeedRef.current = null;
        isDailyRef.current = false;
        setGameSeed(null);
        setIsDaily(false);
        commit({ ...state, rules: loadRules() }, false, false);
        setIsDealing(false);
      })
      .catch(() => {
        if (gen !== dealGenRef.current) return;
        gameSeedRef.current = null;
        isDailyRef.current = false;
        setGameSeed(null);
        setIsDaily(false);
        const dealt = dealSolvableState({ difficulty: loadDifficulty() });
        commit({ ...dealt.state, rules: loadRules() }, false, false);
        setIsDealing(false);
      });
  }, [commit, requestDeal]);

  useEffect(() => {
    if (isDealing) return;
    if (gameState.won) {
      clearSavedGame();
      return;
    }
      saveGame(gameState, timerRef.current, gameSeedRef.current, isDailyRef.current, moveLogRef.current);
  }, [gameState, isDealing]);

  useEffect(() => {
    if (!gameState.won) {
      winRecordedRef.current = false;
      winRecordEffectRef.current = false;
      return;
    }
    if (winRecordEffectRef.current) return;
    winRecordEffectRef.current = true;
    setIsRunning(false);
    setIsGameOver(false);
    if (!winRecordedRef.current) {
      winRecordedRef.current = true;
      snd.playWin();
      if (isDailyRef.current) {
        const key = todayKey();
        markDailyCleared(key);
        setDailyCleared(true);
      }
      setStats(
        applyWin(loadStats(), gameStateRef.current.moves, timerRef.current, gameStateRef.current.score)
      );
      setGameHistory(pushGameHistory({
        won: true,
        moves: gameStateRef.current.moves,
        timeSec: timerRef.current,
        score: gameStateRef.current.score,
        date: todayKey(),
      }));
      const updatedStats = loadStats();
      const updatedHistory = loadGameHistory();
      const newBadges = checkAndUnlockBadges(updatedStats, updatedHistory);
      setUnlockedBadges(loadUnlockedBadges());
      if (newBadges.length > 0) {
        setNewBadge(newBadges[0]);
        window.setTimeout(() => setNewBadge(null), 3000);
      }
    }
    const t = window.setTimeout(() => setShowWinModal(true), WIN_MODAL_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [gameState.won]);

  const handleUndo = useCallback(() => {
    if (history.length === 0 || gameStateRef.current.won) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setAutoStatus(null);
    snd.playUndo();
    logMove({ t: 'u' });
    commit(prev, true, false);
  }, [history, commit, logMove]);

  const handleStockClick = useCallback(() => {
    if (gameStateRef.current.won || isDealing) return;
    const prev = gameStateRef.current;
    const next = flipFromStock(prev);
    if (next !== prev) {
      snd.playDraw();
      logMove({ t: 's' });
      commit(next);
    } else {
      snd.playError();
    }
  }, [isDealing, commit, logMove]);

  const startGame = useCallback((opts: {
    difficulty: DealDifficulty;
    rules: GameRules;
    seed?: number;
    daily?: boolean;
  }) => {
    const prev = gameStateRef.current;
    if (!prev.won && prev.moves > 0) {
      setStats(applyLoss(loadStats()));
      setGameHistory(pushGameHistory({
        won: false,
        moves: prev.moves,
        timeSec: timerRef.current,
        score: prev.score,
        date: todayKey(),
      }));
    }
    clearSavedGame();
    winRecordedRef.current = false;
    if (dealTimeoutRef.current !== null) window.clearTimeout(dealTimeoutRef.current);
    setIsDealing(true);
    setHistory([]);
    moveLogRef.current = [];
    setShowWinModal(false);
    setShowSettings(false);
    setShowStats(false);
    setIsGameOver(false);
    setAutoStatus(null);
    timerRef.current = 0;
    setIsRunning(true);

    gameSeedRef.current = opts.seed ?? null;
    isDailyRef.current = opts.daily === true;
    setGameSeed(opts.seed ?? null);
    setIsDaily(opts.daily === true);

    const gen = ++dealGenRef.current;
    requestDeal(opts.difficulty, opts.seed)
      .then(state => {
        if (gen !== dealGenRef.current) return;
        commit({ ...state, rules: { ...opts.rules } }, false, false);
        setIsDealing(false);
      })
      .catch(() => {
        if (gen !== dealGenRef.current) return;
        const dealt = dealSolvableState({
          difficulty: opts.difficulty,
          ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
        });
        commit({ ...dealt.state, rules: { ...opts.rules } }, false, false);
        setIsDealing(false);
      });
  }, [commit, requestDeal]);

  const handleNewGame = useCallback(() => {
    startGame({ difficulty, rules: settings });
  }, [startGame, difficulty, settings]);

  const handleDailyGame = useCallback(() => {
    startGame({
      difficulty: 'normal',
      rules: settings,
      seed: dailySeed(),
      daily: true,
    });
  }, [startGame, settings]);

  const handleSeedStart = useCallback(() => {
    const parsed = Number(seedInput.trim());
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || seedInput.trim() === '') return;
    startGame({ difficulty, rules: settings, seed: Math.abs(parsed) });
  }, [startGame, difficulty, settings, seedInput]);

  const handleResetStats = useCallback(() => {
    if (!window.confirm('プレイ記録をすべて削除しますか?')) return;
    setStats(resetStats());
    setGameHistory([]);
    resetBadges();
    setUnlockedBadges(new Set());
  }, []);

  const handleSoundToggle = useCallback(() => {
    const next = !soundOn;
    snd.setMuted(!next);
    setSoundOn(next);
  }, [soundOn]);

  const handleThemeToggle = useCallback(() => {
    setTheme(t => {
      const next: Theme = t === 'green' ? 'dark' : 'green';
      saveTheme(next);
      return next;
    });
  }, []);

  const updateRules = useCallback((patch: Partial<GameRules>) => {
    setSettings(r => {
      const next: GameRules = { ...r, ...patch };
      saveRules(next);
      return next;
    });
  }, []);

  const exportMoveLog = useCallback(() => {
    const data = {
      seed: gameSeedRef.current,
      rules: settings,
      moves: moveLogRef.current,
      date: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trick-card-games-replay-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [settings]);

  const importMoveLog = useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (!data.seed || !Array.isArray(data.moves)) {
            resolve(false);
            return;
          }
          moveLogRef.current = data.moves;
          resolve(true);
        } catch {
          resolve(false);
        }
      };
      reader.onerror = () => resolve(false);
      reader.readAsText(file);
    });
  }, []);

  return {
    gameState,
    gameStateRef,
    history,
    isDealing,
    isGameOver,
    showWinModal,
    difficulty,
    stats,
    showStats,
    theme,
    soundOn,
    settings,
    showSettings,
    gameSeed,
    isDaily,
    dailyCleared,
    gameHistory,
    unlockedBadges,
    newBadge,
    seedInput,
    autoStatus,
    isRunning,
    timerRef,
    commit,
    setDifficulty,
    setStats,
    setShowStats,
    setTheme,
    setSoundOn,
    setSettings,
    setShowSettings,
    setSeedInput,
    setAutoStatus,
    setIsRunning,
    handleUndo,
    handleStockClick,
    startGame,
    handleNewGame,
    handleDailyGame,
    handleSeedStart,
    handleResetStats,
    handleSoundToggle,
    handleThemeToggle,
    updateRules,
    logMove,
    exportMoveLog,
    importMoveLog,
  };
}
