import { useState, useCallback, useEffect, useRef } from 'react';
import type { GameState } from '../types';
import { DEFAULT_RULES } from '../types';
import {
  planNextAction,
  applyAction,
  serializeState,
  isDeadlocked,
  createSolver,
  compactPlan,
  expandPlan,
} from '../engine';
import type { Action } from '../engine';

type Phase = 'idle' | 'solving' | 'replaying' | 'greedy';

const SOLVE_TICK_MS = 30;
const SOLVE_SLICE_NODES = 20000;
const SOLVE_MAX_NODES = 150000;
const REPLAY_TICK_MS = 16;

export interface UseAutoModeReturn {
  phase: Phase;
  solveNodes: number;
  autoStatus: string | null;
  autoAllowed: boolean;
  cancelAuto: (message?: string) => void;
  handleAutoModeToggle: (opts: {
    isGameOver: boolean;
    clearHints: () => void;
  }) => void;
}

export function useAutoMode(opts: {
  gameState: GameState;
  gameStateRef: React.MutableRefObject<GameState>;
  commit: (next: GameState, animate?: boolean, record?: boolean) => void;
  setAutoStatus: (v: string | null) => void;
}): UseAutoModeReturn {
  const { gameState, gameStateRef, commit, setAutoStatus } = opts;
  const [phase, setPhase] = useState<Phase>('idle');
  const [solveNodes, setSolveNodes] = useState(0);
  const [autoStatus, setAutoStatusInternal] = useState<string | null>(null);

  const setAutoStatusCombined = useCallback((v: string | null) => {
    setAutoStatusInternal(v);
    setAutoStatus(v);
  }, [setAutoStatus]);

  const visitedStatesRef = useRef<Set<string>>(new Set());
  const solverRef = useRef<ReturnType<typeof createSolver> | null>(null);
  const replayQueueRef = useRef<Action[]>([]);

  const autoAllowed = true;

  const canSolve =
    (gameState.rules?.drawCount ?? DEFAULT_RULES.drawCount) === 1 &&
    (gameState.rules?.maxRecycles ?? DEFAULT_RULES.maxRecycles) < 0;

  const cancelAuto = useCallback((message?: string) => {
    solverRef.current = null;
    replayQueueRef.current = [];
    setPhase('idle');
    if (message !== undefined) setAutoStatusCombined(message);
  }, [setAutoStatusCombined]);

  const handleAutoModeToggle = useCallback((toggleOpts: {
    isGameOver: boolean;
    clearHints: () => void;
  }) => {
    if (!autoAllowed) return;
    if (phase !== 'idle') {
      cancelAuto();
      return;
    }
    if (gameStateRef.current.won || toggleOpts.isGameOver) return;
    toggleOpts.clearHints();
    setAutoStatusCombined(null);
    setSolveNodes(0);
    if (canSolve) {
      solverRef.current = createSolver(gameStateRef.current, SOLVE_MAX_NODES);
      setPhase('solving');
    } else {
      visitedStatesRef.current = new Set([serializeState(gameStateRef.current)]);
      setPhase('greedy');
    }
  }, [phase, autoAllowed, canSolve, cancelAuto, setAutoStatusCombined, gameStateRef]);

  useEffect(() => {
    if (phase !== 'solving') return;
    const interval = setInterval(() => {
      const solver = solverRef.current;
      if (!solver) return;
      const result = solver.step(SOLVE_SLICE_NODES);
      setSolveNodes(result.nodes);
      if (result.status === 'running') return;

      if (result.status === 'won') {
        const plan = solver.getPlan() ?? [];
        replayQueueRef.current = expandPlan(gameStateRef.current, compactPlan(gameStateRef.current, plan));
        setAutoStatusCombined(null);
        setPhase('replaying');
      } else if (result.status === 'unsolvable') {
        setPhase('idle');
        setAutoStatusCombined('この配布は自動プレイではクリアできません');
      } else {
        visitedStatesRef.current = new Set([serializeState(gameStateRef.current)]);
        setAutoStatusCombined('解析上限に達したため簡易AIで継続します');
        setPhase('greedy');
      }
    }, SOLVE_TICK_MS);
    return () => clearInterval(interval);
  }, [phase, setAutoStatusCombined, gameStateRef]);

  useEffect(() => {
    if (phase !== 'replaying' && phase !== 'greedy') return;
    const interval = setInterval(() => {
      const current = gameStateRef.current;
      if (current.won || isDeadlocked(current)) {
        setPhase('idle');
        return;
      }

      if (phase === 'replaying') {
        const action = replayQueueRef.current.shift();
        if (!action) {
          setPhase('idle');
          return;
        }
        const next = applyAction(current, action);
        if (!next) {
          setPhase('idle');
          setAutoStatusCombined('再生中に問題が発生したため停止しました');
          return;
        }
        commit(next, false);
        return;
      }

      const action = planNextAction(current, visitedStatesRef.current);
      if (!action) {
        setPhase('idle');
        setAutoStatusCombined('有効な手が見つからないため自動プレイを停止しました');
        return;
      }
      const next = applyAction(current, action);
      if (!next) {
        setPhase('idle');
        setAutoStatusCombined('有効な手が見つからないため自動プレイを停止しました');
        return;
      }
      visitedStatesRef.current.add(serializeState(next));
      commit(next, false);
    }, REPLAY_TICK_MS);
    return () => clearInterval(interval);
  }, [phase, commit, gameStateRef]);

  return {
    phase,
    solveNodes,
    autoStatus,
    autoAllowed,
    cancelAuto,
    handleAutoModeToggle,
  };
}
