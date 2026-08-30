import React, { useCallback, useEffect } from 'react';
import { useGameCore } from './hooks/useGameCore';
import { useAutoMode } from './hooks/useAutoMode';
import { useHints } from './hooks/useHints';
import { useDragHandler } from './hooks/useDragHandler';
import { useTimer } from './hooks/useTimer';
import { HeaderBar } from './HeaderBar';
import { GameBoard } from './GameBoard';
import { ModalManager } from './ModalManager';
import { UpdateNotification } from './UpdateNotification';
import './Board.css';

export const Board: React.FC = () => {
  const core = useGameCore();

  const auto = useAutoMode({
    gameState: core.gameState,
    gameStateRef: core.gameStateRef,
    commit: core.commit,
    setAutoStatus: core.setAutoStatus,
  });

  const hints = useHints();

  const drag = useDragHandler({
    phase: auto.phase,
    isDealing: core.isDealing,
    gameStateRef: core.gameStateRef,
    commit: core.commit,
    clearHints: hints.clearHints,
    setAutoStatus: core.setAutoStatus,
    logMove: core.logMove,
  });

  const { timer } = useTimer(core.gameState.won, core.isGameOver, core.isDealing);

  const handleUndo = useCallback(() => {
    if (auto.phase !== 'idle' || core.isDealing) return;
    hints.clearHints();
    auto.cancelAuto();
    core.handleUndo();
  }, [auto.phase, core.isDealing, core.handleUndo, hints.clearHints, auto.cancelAuto]);

  const handleStockClick = useCallback(() => {
    if (auto.phase !== 'idle') {
      auto.cancelAuto('手動操作により自動プレイを中断しました');
      return;
    }
    hints.clearHints();
    core.handleStockClick();
  }, [auto.phase, auto.cancelAuto, hints.clearHints, core.handleStockClick]);

  const handleNewGame = useCallback(() => {
    hints.clearHints();
    auto.cancelAuto();
    core.handleNewGame();
  }, [hints.clearHints, auto.cancelAuto, core.handleNewGame]);

  const handleDailyGame = useCallback(() => {
    hints.clearHints();
    auto.cancelAuto();
    core.handleDailyGame();
  }, [hints.clearHints, auto.cancelAuto, core.handleDailyGame]);

  const handleSeedStart = useCallback(() => {
    hints.clearHints();
    auto.cancelAuto();
    core.handleSeedStart();
  }, [hints.clearHints, auto.cancelAuto, core.handleSeedStart]);

  const handleHint = useCallback(() => {
    hints.handleHint({
      gameState: core.gameState,
      isGameOver: core.isGameOver,
      phase: auto.phase,
      isDealing: core.isDealing,
      autoAllowed: auto.autoAllowed,
    });
  }, [hints.handleHint, core.gameState, core.isGameOver, auto.phase, core.isDealing, auto.autoAllowed]);

  const handleAutoModeToggle = useCallback(() => {
    if (!auto.autoAllowed) return;
    if (auto.phase !== 'idle') {
      auto.cancelAuto();
      return;
    }
    hints.clearHints();
    auto.handleAutoModeToggle({
      isGameOver: core.isGameOver,
      clearHints: hints.clearHints,
    });
  }, [auto.autoAllowed, auto.phase, auto.cancelAuto, auto.handleAutoModeToggle, core.isGameOver, hints.clearHints]);

  const canUndo = auto.phase === 'idle' && !core.isDealing && core.history.length > 0 && !core.gameState.won;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        core.setShowStats(false);
        core.setShowSettings(false);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || core.isDealing || core.showStats || core.showSettings) return;
      if (k === ' ') {
        e.preventDefault();
        handleStockClick();
      } else if (k === 'h') {
        handleHint();
      } else if (k === 'n') {
        handleNewGame();
      } else if (k === 'u') {
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleStockClick, handleHint, handleNewGame, core.isDealing, core.showStats, core.showSettings]);

  return (
    <div
      className={`board ${auto.phase !== 'idle' ? 'auto-mode' : ''}`}
      data-theme={core.theme}
    >
      <HeaderBar
        core={core}
        auto={auto}
        hints={hints}
        timer={timer}
        canUndo={canUndo}
        onUndo={handleUndo}
        onHint={handleHint}
        onNewGame={handleNewGame}
        onDailyGame={handleDailyGame}
        onAutoToggle={handleAutoModeToggle}
      />

      <GameBoard
        core={core}
        hints={hints}
        drag={drag}
        onStockClick={handleStockClick}
      />

      <ModalManager
        core={core}
        timer={timer}
        canUndo={canUndo}
        onUndo={handleUndo}
        onNewGame={handleNewGame}
        onSeedStart={handleSeedStart}
      />

      <UpdateNotification />
    </div>
  );
};
