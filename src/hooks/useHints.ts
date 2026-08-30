import { useState, useCallback, useRef } from 'react';
import type { GameState } from '../types';
import { planNextAction, serializeState, explainAction } from '../engine';

const HINT_DURATION_MS = 3000;

export interface UseHintsReturn {
  hintCardIds: Set<string>;
  hintPiles: Set<string>;
  hintStock: boolean;
  hintMessage: string | null;
  clearHints: () => void;
  handleHint: (opts: {
    gameState: GameState;
    isGameOver: boolean;
    phase: string;
    isDealing: boolean;
    autoAllowed: boolean;
  }) => void;
}

export function useHints(): UseHintsReturn {
  const [hintCardIds, setHintCardIds] = useState<Set<string>>(new Set());
  const [hintPiles, setHintPiles] = useState<Set<string>>(new Set());
  const [hintStock, setHintStock] = useState(false);
  const [hintMessage, setHintMessage] = useState<string | null>(null);
  const hintTimeoutRef = useRef<number | null>(null);

  const clearHints = useCallback(() => {
    if (hintTimeoutRef.current !== null) {
      window.clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
    setHintCardIds(new Set());
    setHintPiles(new Set());
    setHintStock(false);
    setHintMessage(null);
  }, []);

  const handleHint = useCallback((opts: {
    gameState: GameState;
    isGameOver: boolean;
    phase: string;
    isDealing: boolean;
    autoAllowed: boolean;
  }) => {
    const { gameState, isGameOver, phase, isDealing, autoAllowed } = opts;
    if (!autoAllowed) return;
    if (gameState.won || isGameOver || phase !== 'idle' || isDealing) return;
    const action = planNextAction(gameState, new Set([serializeState(gameState)]));
    if (!action) return;

    const ids = new Set<string>();
    const piles = new Set<string>();
    let stockHint = false;
    if (action.kind === 'draw') {
      stockHint = true;
    } else {
      const m = action.move;
      if (m.sourceType === 'tableau') {
        gameState.tableau[m.sourceIndex].slice(-m.cardCount).forEach(c => ids.add(c.id));
      } else if (m.sourceType === 'waste') {
        ids.add(gameState.waste[gameState.waste.length - 1].id);
      } else {
        const foundation = gameState.foundations[m.sourceIndex];
        ids.add(foundation[foundation.length - 1].id);
      }
      if (m.targetType === 'foundation') {
        const top = gameState.foundations[m.targetIndex][gameState.foundations[m.targetIndex].length - 1];
        if (top) ids.add(top.id);
        else piles.add(`foundation-${m.targetIndex}`);
      } else {
        const pile = gameState.tableau[m.targetIndex];
        const top = pile[pile.length - 1];
        if (top && top.faceUp) ids.add(top.id);
        else piles.add(`tableau-${m.targetIndex}`);
      }
    }

    if (hintTimeoutRef.current !== null) window.clearTimeout(hintTimeoutRef.current);
    setHintCardIds(ids);
    setHintPiles(piles);
    setHintStock(stockHint);
    setHintMessage(explainAction(gameState, action));
    hintTimeoutRef.current = window.setTimeout(() => {
      hintTimeoutRef.current = null;
      clearHints();
    }, HINT_DURATION_MS);
  }, [clearHints]);

  return { hintCardIds, hintPiles, hintStock, hintMessage, clearHints, handleHint };
}
