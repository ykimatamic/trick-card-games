import React, { useEffect, useRef, useState } from 'react';
import { useTurnHost } from './contract';
import { oldMaidDef, targetOf } from './oldmaid';
import type { OldMaidState, OldMaidAction } from './oldmaid';
import type { MpCard } from './cards';
import { MpCardView } from './MpCardView';
import { MpTopBar } from './MpTopBar';
import { MpRecord } from './MpRecord';
import { useMpChrome, rankMedal } from './MpChrome';
import * as snd from '../sound';
import './games.css';

interface OldMaidViewProps {
  initialPlayers?: number;
}

const HUMAN = 0;

export const OldMaidView: React.FC<OldMaidViewProps> = ({ initialPlayers = 3 }) => {
  const chrome = useMpChrome();
  const host = useTurnHost<OldMaidState, OldMaidAction>(oldMaidDef, {
    cpuDelayMs: 900,
    humanPlayerId: HUMAN,
    onApply: (_prev, next) => {
      if (next.done) {
        snd.playWin();
      } else {
        snd.playDraw();
      }
    },
  });
  const [selectedPlayers, setSelectedPlayers] = useState(initialPlayers);

  const startGame = () => host.start(selectedPlayers, 'あなた');
  const reStart = () => startGame();

  const state = host.gameState;
  const isHumanTurn =
    host.currentPlayer === HUMAN && !host.finished && state !== null;

  const targetForHuman = state ? targetOf(state) : null;

  // 引いたカードを一時的に開示してから解決する(ペアで即消える前に見せるため)
  const [reveal, setReveal] = useState<{ card: MpCard; fromName: string } | null>(null);
  const revealTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(revealTimer.current), []);

  const handleDraw = (p: { id: number; name: string }, cardIndex: number) => {
    if (!isHumanTurn || p.id !== targetForHuman) return;
    const card = state?.hands[p.id]?.[cardIndex];
    if (!card) return;
    setReveal({ card: { ...card, faceUp: true }, fromName: p.name });
    window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => {
      setReveal(null);
      host.play({ cardIndex });
    }, 850);
  };

  if (!state || host.players.length === 0) {
    return (
      <div className="mp-table" data-theme={chrome.theme}>
        <MpTopBar title="🃏 ババ抜き" {...chrome} />
        <div className="mp-lobby">
          <h2 className="mp-lobby-title">🃏 ババ抜き</h2>
          <p className="mp-lobby-desc">
            ジョーカーを最後まで持っている人が負け。同じ数字のペアは自動で捨てられます。
          </p>
          <span className="mp-lobby-label">プレイヤー数</span>
          <div className="mp-lobby-chips">
            {[2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                type="button"
                className={`mp-lobby-chip ${selectedPlayers === n ? 'mp-selected' : ''}`}
                onClick={() => setSelectedPlayers(n)}
              >
                {n}人
              </button>
            ))}
          </div>
          <button className="mp-primary mp-start" onClick={startGame}>
            はじめる
          </button>
        </div>
      </div>
    );
  }

  const myHand = state.hands[HUMAN] ?? [];

  return (
    <div className="mp-table" data-theme={chrome.theme}>
      <MpTopBar title="🃏 ババ抜き" {...chrome} onRestart={reStart} />

      <div className="mp-status">
        <span className={`mp-turn ${host.finished ? 'mp-done' : ''}`}>
          {host.finished
            ? 'ゲーム終了'
            : host.currentPlayer === HUMAN
              ? 'あなたの番です(次の人のカードをクリック)'
              : `${host.players[host.currentPlayer!]?.name ?? 'CPU'} の番…`}
        </span>
      </div>

      {/* 相手の手札(伏せ) */}
      <div className="mp-opponents">
        {host.players.map(p => {
          if (p.id === HUMAN) return null;
          const hand = state.hands[p.id] ?? [];
          const isTarget = !host.finished && p.id === targetForHuman && isHumanTurn;
          const active = !host.finished && state.activePlayers.includes(p.id);
          const isCurrent = !host.finished && p.id === host.currentPlayer;
          return (
            <div
              key={p.id}
              className={`mp-opponent ${isTarget ? 'mp-opponent-target' : ''} ${isCurrent ? 'mp-opponent-active' : ''} ${active ? '' : 'mp-opponent-out'}`}
            >
              <div className="mp-opponent-name">
                {p.name}
                {isTarget && <span className="mp-badge">引く</span>}
                {!active && <span className="mp-badge-out">上がり</span>}
              </div>
              <div className="mp-opponent-cards">
                {Array.from({ length: Math.min(hand.length, 14) }).map((_, i) => (
                  <div
                    key={i}
                    className="mp-opponent-card"
                    style={{ marginLeft: i === 0 ? 0 : -12 }}
                    onClick={() => handleDraw(p, i % Math.max(hand.length, 1))}
                    role="button"
                    tabIndex={isTarget && isHumanTurn ? 0 : -1}
                    aria-label={`${p.name}の手札`}
                  >
                    <div className="mp-card mp-card-back mp-card-mini">
                      <div className="mp-card-back-pattern">
                        <span>♠</span><span>♣</span><span>♥</span><span>♦</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {hand.length === 0 ? (
                <span className="mp-hand-count">0</span>
              ) : (
                <span className="mp-hand-count">{hand.length}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 自分の手札 */}
      <div className="mp-hand-wrap">
        <div className="mp-hand-label">あなたの手札 ({myHand.length})</div>
        <div className="mp-hand">
          {myHand.map((c, i) => (
            <div key={c.id} className="mp-card-slot" style={{ '--i': i } as React.CSSProperties }>
              <MpCardView card={c} faceUp small />
            </div>
          ))}
        </div>
      </div>

      {/* 引いたカードの開示(自動解決まで表示) */}
      {reveal && (
        <div className="mp-overlay">
          <div className="mp-modal">
            <h3>{reveal.fromName} から引いたカード</h3>
            <div className="mp-reveal-card">
              <MpCardView card={reveal.card} faceUp />
            </div>
            <p className="mp-reveal-note">ペアがあれば自動で捨てられます…</p>
          </div>
        </div>
      )}

      {/* 結果 */}
      {host.finished && host.results && (
        <div className="mp-overlay">
          <div className="mp-modal">
            <h3>ゲーム終了</h3>
            {(() => {
              const r = host.results;
              return (
                <ol className="mp-ranking">
                  {r.map((res, idx) => {
                    const isYou = res.playerId === HUMAN;
                    const name = isYou ? 'あなた' : host.players[res.playerId]?.name ?? `CPU${res.playerId + 1}`;
                    return (
                      <li
                        key={res.playerId}
                        className={`${idx === 0 ? 'mp-first' : ''} ${res.isLoser ? 'mp-loser' : ''}`}
                        style={{ '--i': idx } as React.CSSProperties }
                      >
                        <span className="mp-rank-medal">{res.isLoser ? '🗿' : rankMedal(res.rank)}</span>
                        <span className="mp-rank-name">{name}</span>
                        <span className="mp-rank-note">
                          {res.isLoser ? '👎 ババ抜き' : `${res.rank}位`}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              );
            })()}
            <MpRecord gameId="old-maid" />
            <button className="mp-primary" onClick={reStart}>もう一度</button>
            <button className="mp-ghost" onClick={() => (window.location.hash = '/')}>メニューへ</button>
          </div>
        </div>
      )}
    </div>
  );
};