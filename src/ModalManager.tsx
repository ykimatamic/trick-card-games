import React, { useCallback, useState } from 'react';
import { WinCascade } from './WinCascade';
import { StatsChart } from './StatsChart';
import { ALL_BADGES } from './badges';
import { copyReplayUrl } from './replay';
import type { UseGameCoreReturn } from './hooks/useGameCore';

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

interface ModalManagerProps {
  core: UseGameCoreReturn;
  timer: number;
  canUndo: boolean;
  onUndo: () => void;
  onNewGame: () => void;
  onSeedStart: () => void;
}

export const ModalManager: React.FC<ModalManagerProps> = ({
  core, timer, canUndo, onUndo, onNewGame, onSeedStart,
}) => {
  const [replayCopied, setReplayCopied] = useState(false);

  const handleShareReplay = useCallback(async () => {
    if (core.gameSeed === null) return;
    const ok = await copyReplayUrl({
      seed: core.gameSeed,
      rules: core.settings,
      moves: [],
    });
    if (ok) {
      setReplayCopied(true);
      window.setTimeout(() => setReplayCopied(false), 2000);
    }
  }, [core.gameSeed, core.settings]);

  const winRate =
    core.stats.played > 0 ? `${Math.round((core.stats.wins / core.stats.played) * 100)}%` : '-';

  return (
    <>
      {core.showStats && (
        <div className="win-overlay" onClick={() => core.setShowStats(false)}>
          <div className="win-modal stats-modal" onClick={(e) => e.stopPropagation()}>
            <h2>プレイ記録</h2>
            <dl className="stats-list">
              <div><dt>対局数</dt><dd>{core.stats.played}</dd></div>
              <div><dt>勝利数</dt><dd>{core.stats.wins}</dd></div>
              <div><dt>勝率</dt><dd>{winRate}</dd></div>
              <div><dt>現在の連勝</dt><dd>{core.stats.streak}</dd></div>
              <div><dt>最高連勝</dt><dd>{core.stats.bestStreak}</dd></div>
              <div><dt>ベストタイム</dt><dd>{core.stats.bestTimeSec !== null ? formatTime(core.stats.bestTimeSec) : '-'}</dd></div>
              <div><dt>最少手数</dt><dd>{core.stats.bestMoves !== null ? core.stats.bestMoves : '-'}</dd></div>
              <div><dt>ベストスコア</dt><dd>{core.stats.bestScore !== null ? core.stats.bestScore : '-'}</dd></div>
            </dl>
            <StatsChart history={core.gameHistory} />
            <div className="badges-section">
              <h3>実績バッジ</h3>
              <div className="badges-grid">
                {ALL_BADGES.map(b => {
                  const unlocked = core.unlockedBadges.has(b.id);
                  return (
                    <div key={b.id} className={`badge ${unlocked ? 'unlocked' : 'locked'}`} title={b.description}>
                      <span className="badge-emoji">{b.emoji}</span>
                      <span className="badge-name">{b.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="shortcut-note">
              Space=ドロー / H=ヒント / U=元に戻す / N=新しいゲーム / Ctrl+Z=元に戻す
            </p>
            <div className="modal-buttons">
              <button className="undo-btn" onClick={core.handleResetStats}>
                リセット
              </button>
              <button className="new-game-btn" onClick={() => core.setShowStats(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {core.showSettings && (
        <div className="win-overlay" onClick={() => core.setShowSettings(false)}>
          <div className="win-modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <h2>ルール設定</h2>
            <div className="settings-list">
              <label className="setting-row">
                <span>ドロー枚数</span>
                <select
                  value={core.settings.drawCount}
                  onChange={(e) => core.updateRules({ drawCount: Number(e.target.value) as 1 | 3 })}
                >
                  <option value={1}>1枚(自動プレイ対応)</option>
                  <option value={3}>3枚</option>
                </select>
              </label>
              <label className="setting-row">
                <span>リサイクル回数</span>
                <select
                  value={core.settings.maxRecycles}
                  onChange={(e) => core.updateRules({ maxRecycles: Number(e.target.value) })}
                >
                  <option value={-1}>無制限(自動プレイ対応)</option>
                  <option value={1}>1周まで</option>
                  <option value={3}>3周まで</option>
                </select>
              </label>
              <label className="setting-row">
                <span>スコア方式</span>
                <select
                  value={core.settings.scoring}
                  onChange={(e) => core.updateRules({ scoring: e.target.value as 'standard' | 'vegas' })}
                >
                  <option value="standard">標準</option>
                  <option value="vegas">Vegas(基礎送り+5のみ)</option>
                </select>
              </label>
            </div>
            <p className="shortcut-note">
              ※ 変更は次の「新しいゲーム」から適用されます。ドロー3枚・リサイクル制限では自動プレイ/ヒント/詰み判定が無効になります。
            </p>
            <div className="seed-row">
              <span>シードで開始:</span>
              <input
                type="text"
                inputMode="numeric"
                value={core.seedInput}
                onChange={(e) => core.setSeedInput(e.target.value)}
                placeholder="例: 12345"
              />
              <button
                className="new-game-btn seed-start-btn"
                onClick={onSeedStart}
                disabled={!/^\d+$/.test(core.seedInput.trim())}
              >
                開始
              </button>
            </div>
            <div className="import-export-row">
              <button className="undo-btn" onClick={core.exportMoveLog} title="操作履歴をJSONで書き出し">
                エクスポート
              </button>
              <label className="undo-btn import-label" title="操作履歴JSONを読み込み">
                インポート
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const ok = await core.importMoveLog(file);
                      if (!ok) alert('ファイルの読み込みに失敗しました');
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <div className="modal-buttons">
              <button className="new-game-btn" onClick={() => core.setShowSettings(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {core.gameState.won && (
        <div className="win-overlay">
          {!prefersReducedMotion() && <WinCascade />}
          {core.showWinModal && (
            <div className="win-modal">
              <h2>おめでとうございます!</h2>
              <p>{core.isDaily ? 'デイリーチャレンジ クリア!' : 'ゲームクリア!'}</p>
              <p>スコア: {core.gameState.score}</p>
              <p>手数: {core.gameState.moves}</p>
              <p>時間: {formatTime(timer)}</p>
              {core.gameSeed !== null && (
                <p className="shortcut-note">シード: {core.gameSeed}(同じシードで同じ配布を再現できます)</p>
              )}
              <div className="modal-buttons">
                <button className="undo-btn" onClick={handleShareReplay}>
                  {replayCopied ? 'コピーしました!' : 'URLを共有'}
                </button>
                <button className="new-game-btn" onClick={onNewGame}>
                  もう一度プレイ
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {core.isGameOver && !core.gameState.won && (
        <div className="win-overlay">
          <div className="win-modal gameover-modal">
            <h2>ゲームオーバー</h2>
            <p>もう動かせるカードがありません</p>
            <p>手数: {core.gameState.moves}</p>
            <p>時間: {formatTime(timer)}</p>
            <div className="modal-buttons">
              {canUndo && (
                <button className="undo-btn" onClick={onUndo}>
                  ↶ 一手戻る
                </button>
              )}
              <button className="new-game-btn" onClick={onNewGame}>
                もう一度プレイ
              </button>
            </div>
          </div>
        </div>
      )}

      {core.newBadge && (() => {
        const badge = ALL_BADGES.find(b => b.id === core.newBadge);
        if (!badge) return null;
        return (
          <div className="badge-toast">
            <span className="badge-toast-emoji">{badge.emoji}</span>
            <span className="badge-toast-text">実績解除: {badge.name}</span>
          </div>
        );
      })()}

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {core.autoStatus}
      </div>
    </>
  );
};
