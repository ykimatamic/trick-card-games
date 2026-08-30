import React, { useEffect, useState } from 'react';
import { useTurnHost } from './contract';
import { memoryDef } from './memory';
import type { MemoryState, MemoryAction } from './memory';
import { MpCardView } from './MpCardView';
import { MpTopBar } from './MpTopBar';
import { MpRecord } from './MpRecord';
import { useMpChrome, rankMedal } from './MpChrome';
import * as snd from '../sound';
import './games.css';

interface MemoryViewProps {
  initialPlayers?: number;
}

const HUMAN = 0;

/** 2枚めくり後、結果確定までの表示時間(ms) */
const REVEAL_MS = 800;

export const MemoryView: React.FC<MemoryViewProps> = ({ initialPlayers = 2 }) => {
  const chrome = useMpChrome();
  const host = useTurnHost<MemoryState, MemoryAction>(memoryDef, {
    cpuDelayMs: 900,
    humanPlayerId: HUMAN,
    onApply: (prev, next) => {
      // ペア確定(2枚めくり済み→解決)で成功/ミスの音を再生。終了で勝利ファンファーレ
      if (next.pending === false && prev.pending === true) {
        // 手番が変わらなければペア成立(成功音)、変われば不一致(ミス音)。
        // 最後のペアでゲームが終了した場合は currentPlayer が -1 になるため除外
        if (!next.done && next.currentPlayer >= 0) {
          if (next.currentPlayer === prev.currentPlayer) {
            snd.playFoundation(next.currentPlayer);
          } else {
            snd.playError();
          }
        }
      }
      if (next.done) {
        snd.playWin();
      }
    },
  });
  const [selectedPlayers, setSelectedPlayers] = useState(initialPlayers);

  const startGame = () => host.start(selectedPlayers, 'あなた');
  const reStart = () => startGame();

  const state = host.gameState;
  const isHumanTurn = host.currentPlayer === HUMAN && !host.finished && state !== null;

  // 人間が2枚めくり終えたら少し間を置いて結果を確定する(2枚目がはやすぎないように)
  // host.play は安定した参照(useCallback)なので、不安定な host オブジェクト全体を依存に入れない
  useEffect(() => {
    if (!state || !state.pending || state.done) return;
    if (host.currentPlayer !== HUMAN) return;
    const handle = setTimeout(() => {
      host.play({ type: 'resolve' });
    }, REVEAL_MS);
    return () => clearTimeout(handle);
  }, [state, host.currentPlayer, host.play]);

  if (!state || host.players.length === 0) {
    return (
      <div className="mp-table" data-theme={chrome.theme}>
        <MpTopBar title="🧠 神経衰弱" {...chrome} />
        <div className="mp-lobby">
          <h2 className="mp-lobby-title">🧠 神経衰弱</h2>
          <p className="mp-lobby-desc">
            場のカードを2枚ずつめくり、同じ数字のペアを探して集めます。多く集めた人が勝ち。CPUはめくったカードを覚えています。
          </p>
          <span className="mp-lobby-label">プレイヤー数(自分 + CPU)</span>
          <div className="mp-lobby-chips">
            {[2, 3, 4].map(n => (
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

  const isFlipped = (i: number) => state.flipped.includes(i);

  return (
    <div className="mp-table mp-table-memory" data-theme={chrome.theme}>
      <MpTopBar title="🧠 神経衰弱" {...chrome} onRestart={reStart} />

      <div className="mp-status">
        <span className={`mp-turn ${host.finished ? 'mp-done' : ''}`}>
          {host.finished
            ? 'ゲーム終了'
            : host.currentPlayer === HUMAN
              ? 'あなたの番です(カードを2枚めくる)'
              : `${host.players[host.currentPlayer!]?.name ?? 'CPU'} の番…(2枚めくる)`}
        </span>
      </div>

      {/* プレイヤー(獲得枚数) */}
      <div className="mm-players">
        {host.players.map(p => {
          const collected = state.collected[p.id] ?? [];
          const isYou = p.id === HUMAN;
          const isCurrent = !host.finished && p.id === host.currentPlayer;
          return (
            <div
              key={p.id}
              className={`mm-player-chip ${isCurrent ? 'mm-active' : ''} ${isYou ? 'mm-you' : ''}`}
            >
              <span className="mm-player-name">{isYou ? 'あなた' : p.name}</span>
              <span className="mm-player-count">{collected.length}枚</span>
            </div>
          );
        })}
      </div>

      {/* カード格子 */}
      <div className="mm-grid">
        {state.cards.map((c, i) => {
          if (c === null) {
            return <div key={i} className="mm-slot mm-slot-empty" />;
          }
          const up = isFlipped(i);
          const clickable =
            !host.finished && isHumanTurn && !up && !state.pending && state.flipped.length < 2;
          return (
            <div key={i} className={`mm-slot ${up ? 'mm-up' : ''}`}>
              <MpCardView
                card={c}
                faceUp={up}
                onClick={
                  clickable
                    ? () => {
                        host.play({ type: 'flip', flipIndex: i });
                      }
                    : undefined
                }
                ariaLabel={up ? undefined : '伏せたカード'}
              />
            </div>
          );
        })}
      </div>

      {/* 結果 */}
      {host.finished && host.results && (
        <div className="mp-overlay">
          <div className="mp-modal">
            <h3>ゲーム終了</h3>
            <div className="mp-modal-stats">
              <div>
                獲得総数 <b>{state.collected.reduce((a, b) => a + b.length, 0)}枚</b>
              </div>
            </div>
            <ol className="mp-ranking">
              {host.results.map((res, idx) => {
                const isYou = res.playerId === HUMAN;
                const name = isYou ? 'あなた' : host.players[res.playerId]?.name ?? `CPU${res.playerId + 1}`;
                const count = state.collected[res.playerId]?.length ?? 0;
                return (
                  <li
                    key={res.playerId}
                    className={`${idx === 0 ? 'mp-first' : ''}`}
                    style={{ '--i': idx } as React.CSSProperties}
                  >
                    <span className="mp-rank-medal">{rankMedal(res.rank)}</span>
                    <span className="mp-rank-name">{name}</span>
                    <span className="mp-rank-note">{count}枚</span>
                  </li>
                );
              })}
            </ol>
            <MpRecord gameId="memory" />
            <button className="mp-primary" onClick={reStart}>もう一度</button>
            <button className="mp-ghost" onClick={() => (window.location.hash = '/')}>メニューへ</button>
          </div>
        </div>
      )}
    </div>
  );
};
