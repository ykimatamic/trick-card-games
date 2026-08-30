import React, { useCallback } from 'react';
import { todayKey } from './stats';
import type { DealDifficulty } from './engine';
import type { UseGameCoreReturn } from './hooks/useGameCore';
import type { UseAutoModeReturn } from './hooks/useAutoMode';
import type { UseHintsReturn } from './hooks/useHints';

interface HeaderBarProps {
  core: UseGameCoreReturn;
  auto: UseAutoModeReturn;
  hints: UseHintsReturn;
  timer: number;
  canUndo: boolean;
  onUndo: () => void;
  onHint: () => void;
  onNewGame: () => void;
  onDailyGame: () => void;
  onAutoToggle: () => void;
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const HeaderBar: React.FC<HeaderBarProps> = ({
  core, auto, hints, timer, canUndo,
  onUndo, onHint, onNewGame, onDailyGame, onAutoToggle,
}) => {
  const handleDifficultyChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    core.setDifficulty(e.target.value as DealDifficulty);
  }, [core.setDifficulty]);

  const autoButtonLabel =
    auto.phase === 'solving'
      ? '⏹ 解析停止'
      : auto.phase === 'replaying' || auto.phase === 'greedy'
        ? '⏸ 停止'
        : '▶ 自動';

  return (
    <header className="board-header">
      <h1>ソリティア</h1>
      <div className="game-info">
        <span>スコア: {core.gameState.score}</span>
        <span>手数: {core.gameState.moves}</span>
        <span>時間: {formatTime(timer)}</span>
        {auto.phase === 'solving' && (
          <span className="auto-status" style={{ color: '#3498db', fontSize: '12px' }}>
            最善手を解析中… ({auto.solveNodes}ノード)
          </span>
        )}
        {auto.phase !== 'solving' && core.autoStatus && (
          <span className="auto-status" style={{ color: '#e67e22', fontSize: '12px' }}>
            {core.autoStatus}
          </span>
        )}
        {hints.hintMessage && (
          <span className="auto-status" style={{ color: '#f1c40f', fontSize: '12px' }}>
            💡 {hints.hintMessage}
          </span>
        )}
      </div>
      <div className="header-buttons">
        <select
          className="diff-select"
          value={core.difficulty}
          onChange={handleDifficultyChange}
          aria-label="難易度"
          title="次の「新しいゲーム」から適用されます"
        >
          <option value="easy">やさしい</option>
          <option value="normal">ふつう</option>
          <option value="hard">難敵</option>
        </select>
        <button
          className={`auto-btn ${auto.phase !== 'idle' ? 'auto-active' : ''}`}
          onClick={onAutoToggle}
          disabled={!auto.autoAllowed}
          title={auto.autoAllowed ? undefined : '自動プレイはドロー1・リサイクル無制限のみ対応'}
        >
          {autoButtonLabel}
        </button>
        <button className="undo-btn" onClick={onUndo} disabled={!canUndo}>
          ↶ 元に戻す
        </button>
        <button
          className="hint-btn"
          onClick={onHint}
          disabled={!auto.autoAllowed}
          title={auto.autoAllowed ? undefined : 'ヒントはドロー1・リサイクル無制限のみ対応'}
        >
          ヒント
        </button>
        <button className="new-game-btn" onClick={onNewGame}>
          新しいゲーム
        </button>
        <button
          className="icon-btn"
          onClick={onDailyGame}
          title={`デイリーチャレンジ(${todayKey()})${core.dailyCleared ? ': 完了済み ✓' : ''}`}
        >
          📅{core.dailyCleared ? '✓' : ''}
        </button>
        <button
          className="icon-btn"
          onClick={() => core.setShowSettings(true)}
          title="ルール設定"
        >
          ⚙️
        </button>
        <button
          className="icon-btn"
          onClick={core.handleSoundToggle}
          title={core.soundOn ? 'サウンドをオフにする' : 'サウンドをオンにする'}
        >
          {core.soundOn ? '🔊' : '🔇'}
        </button>
        <button className="icon-btn" onClick={core.handleThemeToggle} title="テーマ切替">
          🎨
        </button>
        <button className="stats-btn" onClick={() => core.setShowStats(true)}>
          📊 記録
        </button>
        <span className="version-label">v{__APP_VERSION__}</span>
      </div>
    </header>
  );
};
