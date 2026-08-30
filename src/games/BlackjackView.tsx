import React, { useState } from 'react';
import { useTurnHost } from './contract';
import { blackjackDef, BET_CHIPS, handValue } from './blackjack';
import type { BlackjackState, BlackjackAction } from './blackjack';
import { MpCardView } from './MpCardView';
import { MpTopBar } from './MpTopBar';
import { loadChips, saveChips } from './gameStats';
import { useMpChrome } from './MpChrome';
import * as snd from '../sound';
import './games.css';

interface BlackjackViewProps {
  initialBank?: number;
}

const HUMAN = 0;

const OUTCOME_LABEL: Record<string, string> = {
  win: '🏆 あなたの勝ち!',
  blackjack: '🃏 ブラックジャック!',
  push: '🤝 引き分け',
  lose: '💸 負け…',
};

/** 表向きのカードだけで合計を算出(伏せているホールカードの値を漏らさない) */
function visibleHandValue(hand: BlackjackState['dealer']): number {
  const visible = hand.filter(c => c.faceUp);
  return visible.length === 0 ? 0 : handValue(visible);
}

export const BlackjackView: React.FC<BlackjackViewProps> = ({ initialBank = 1000 }) => {
  const chrome = useMpChrome();
  const host = useTurnHost<BlackjackState, BlackjackAction>(blackjackDef, {
    cpuDelayMs: 900,
    humanPlayerId: HUMAN,
    rng: Math.random,
    onApply: (_prev, next) => {
      if (next.done) {
        saveChips('blackjack', next.bank);
        if (next.outcome === 'win' || next.outcome === 'blackjack') snd.playWin();
        else snd.playPlace();
      } else {
        snd.playDraw();
      }
    },
  });
  const [startBank, setStartBank] = useState<number>(() => loadChips('blackjack') ?? initialBank);

  const startGame = (bank?: number) => host.start(2, 'あなた', { startBank: bank ?? (startBank || initialBank) });
  const reStart = (bank: number) => startGame(bank);

  const state = host.gameState;
  const isHumanTurn = host.currentPlayer === HUMAN && !host.finished && state !== null;

  if (!state || host.players.length === 0) {
    return (
      <div className="mp-table mp-table-blackjack" data-theme={chrome.theme}>
        <MpTopBar title="🃏 ブラックジャック" {...chrome} />
        <div className="mp-lobby">
          <h2 className="mp-lobby-title">🃏 ブラックジャック</h2>
          <p className="mp-lobby-desc">
            ディーラーとの点数のやりとり。21を超えずにディーラーより大きくすれば勝ちです。掛金(チップ)で対戦します。
          </p>
          <span className="mp-lobby-label">開始時のチップ</span>
          <div className="mp-lobby-chips">
            {[500, 1000, 2000, 5000].map(n => (
              <button
                key={n}
                type="button"
                className={`mp-lobby-chip ${startBank === n ? 'mp-selected' : ''}`}
                onClick={() => setStartBank(n)}
              >
                {n}枚
              </button>
            ))}
          </div>
          <button className="mp-primary mp-start" onClick={() => startGame()}>
            はじめる
          </button>
        </div>
      </div>
    );
  }

  const inBet = state.phase === 'bet';
  const inTurn = state.phase === 'turn';
  const doubleAllowed = state.phase === 'turn' && state.bet * 2 <= state.bank;
  const broke = host.finished && state.bank === 0;

  return (
    <div className="mp-table mp-table-blackjack" data-theme={chrome.theme}>
      <MpTopBar
        title="🃏 ブラックジャック"
        {...chrome}
        onRestart={() => startGame(state.bank)}
      />

      <div className="mp-status">
        <span className={`mp-turn ${host.finished ? 'mp-done' : ''}`}>
          {host.finished
            ? 'ゲーム終了'
            : inBet
              ? '賭けるチップを選択してください'
              : state.phase === 'dealer'
                ? 'ディーラーの番…'
                : isHumanTurn
                  ? 'あなたの番です'
                  : '…' }
        </span>
      </div>

      {/* チップ残高 */}
      <div className="bj-bank">
        チップ <b>{state.bank}</b> 枚
        {state.bet > 0 && <span className="bj-bet">(賭け {state.bet} 枚)</span>}
      </div>

      {/* ディーラー */}
      <div className="bj-area">
        <div className="bj-label">
          ディーラー{' '}
          <span className="bj-total">
            {state.dealer.length === 0 ? '' : visibleHandValue(state.dealer)}
          </span>
        </div>
        <div className="bj-hand">
          {state.dealer.length === 0 ? (
            <span className="bj-empty">待機中</span>
          ) : (
            state.dealer.map((c, i) => (
              <div key={`${i}-${c.id}`} className="bj-card-slot">
                <MpCardView card={c} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* プレイヤー */}
      <div className="bj-area bj-player-area">
        <div className="bj-label">
          あなた{' '}
          <span className="bj-total">
            {state.player.length === 0 ? '' : handValue(state.player)}
          </span>
        </div>
        <div className="bj-hand">
          {state.player.length === 0 ? (
            <span className="bj-empty">チップを賭けて開始</span>
          ) : (
            state.player.map((c, i) => (
              <div key={`${i}-${c.id}`} className="bj-card-slot">
                <MpCardView card={c} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* 操作 */}
      <div className="bj-actions">
        {inBet && (
          <div className="bj-bet-chips">
            {BET_CHIPS.filter(a => a <= state.bank).map(amount => (
              <button
                key={amount}
                type="button"
                className="bj-chip-btn"
                onClick={() => host.play({ type: 'bet', amount })}
              >
                {amount}
              </button>
            ))}
          </div>
        )}
        {inTurn && (
          <>
            <button className="mp-primary bj-act" onClick={() => host.play({ type: 'hit' })}>
              + ヒット
            </button>
            <button className="mp-primary bj-act" onClick={() => host.play({ type: 'stand' })}>
              ✋ スタンド
            </button>
            <button
              className="mp-ghost bj-act"
              disabled={!doubleAllowed}
              onClick={() => host.play({ type: 'double' })}
            >
              ×2 ダブル
            </button>
          </>
        )}
        {state.phase === 'dealer' && <div className="bj-dealer-play">ディーラーがカードを引いています…</div>}
      </div>

      {/* 結果 */}
      {host.finished && state.outcome && (
        <div className="mp-overlay">
          <div className="mp-modal">
            <h3>{broke ? '💔 ゲームオーバー' : OUTCOME_LABEL[state.outcome]}</h3>
            <div className="mp-modal-stats">
              <div>
                あなた <b>{state.player.length ? handValue(state.player) : 0}</b>
              </div>
              <div>
                ディーラー <b>{state.dealer.length ? handValue(state.dealer) : 0}</b>
              </div>
              <div>
                損益 <b className={state.net >= 0 ? 'bj-plus' : 'bj-minus'}>
                  {state.net >= 0 ? `+${state.net}` : state.net} 枚
                </b>
              </div>
            </div>
            <p className="bj-modal-bank">
              残りチップ <b>{state.bank}</b> 枚
            </p>
            {broke && (
              <p className="bj-modal-bank">持ち金が 0 になりました。掛けられるチップがありません。</p>
            )}
            <div className="mp-modal-row">
              {!broke && (
                <button className="mp-primary" onClick={() => reStart(state.bank)}>
                  もう一度
                </button>
              )}
              {broke && (
                <button className="mp-primary" onClick={() => reStart(initialBank)}>
                  チップをリセットして再挑戦
                </button>
              )}
              <button className="mp-ghost" onClick={() => (window.location.hash = '/')}>
                メニューへ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
