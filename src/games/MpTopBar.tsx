import React from 'react';
import type { MpChrome } from './MpChrome';

interface MpTopBarProps extends MpChrome {
  title: string;
  onRestart?: () => void;
}

/** 対戦ゲーム共通のヘッダー(メニューへ戻る / タイトル / 再戦・サウンド・テーマ) */
export const MpTopBar: React.FC<MpTopBarProps> = ({
  title,
  theme,
  soundOn,
  onRestart,
  toggleTheme,
  toggleSound,
}) => (
  <header className="mp-topbar">
    <button className="mp-icon-btn mp-back" onClick={() => (window.location.hash = '/')} title="メニューへ戻る">
      ← メニュー
    </button>
    <h2 className="mp-title">{title}</h2>
    <div className="mp-top-btns">
      {onRestart && (
        <button className="mp-icon-btn mp-restart" onClick={onRestart} title="新しいゲーム">
          🔄
        </button>
      )}
      <button
        className="mp-icon-btn"
        onClick={toggleSound}
        title={soundOn ? 'サウンドをオフにする' : 'サウンドをオンにする'}
      >
        {soundOn ? '🔊' : '🔇'}
      </button>
      <button
        className="mp-icon-btn"
        onClick={toggleTheme}
        title={`テーマ切替(${theme === 'green' ? 'ダーク' : 'グリーン'})`}
      >
        🎨
      </button>
    </div>
  </header>
);