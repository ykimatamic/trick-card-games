import React, { useEffect, useState } from 'react';
import { useTurnHost } from './contract';
import { cheatDef, nextRank, canDoubt } from './cheat';
import type { CheatState, CheatAction } from './cheat';
import { MpCardView } from './MpCardView';
import { MpTopBar } from './MpTopBar';
import { MpRecord } from './MpRecord';
import { useMpChrome, rankMedal } from './MpChrome';
import * as snd from '../sound';
import './games.css';

interface CheatViewProps {
  initialPlayers?: number;
}

const HUMAN = 0;
const MAX_PLAY = 4;

export const CheatView: React.FC<CheatViewProps> = ({ initialPlayers = 3 }) => {
  const chrome = useMpChrome();
  const host = useTurnHost<CheatState, CheatAction>(cheatDef, {
    cpuDelayMs: 900,
    humanPlayerId: HUMAN,
    onApply: (_prev, next, action) => {
      if (next.done) {
        snd.playWin();
      } else if (action.type === 'doubt') {
        snd.playError();
      } else {
        snd.playPlace();
      }
    },
  });
  const [selectedPlayers, setSelectedPlayers] = useState(initialPlayers);
  const [selected, setSelected] = useState<number[]>([]);

  const state = host.gameState;
  const isHumanTurn = host.currentPlayer === HUMAN && !host.finished && state !== null;

  // 手番・盤面が変わったら選択をリセット
  useEffect(() => {
    setSelected([]);
  }, [host.currentPlayer, host.finished, host.gameState?.currentPlayer]);

  const startGame = () => {
    setSelected([]);
    host.start(selectedPlayers, 'あなた');
  };
  const reStart = () => startGame();

  if (!state || host.players.length === 0) {
    return (
      <div className="mp-table mp-table-cheat" data-theme={chrome.theme}>
        <MpTopBar title="🕵️ ダウト" {...chrome} />
        <div className="mp-lobby">
          <h2 className="mp-lobby-title">🕵️ ダウト</h2>
          <p className="mp-lobby-desc">
            手札を伏せて「宣言したランク」のカードとして出していきます。本当に出しても嘘を出してもOK。疑ったら「ダウト」！
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
  const declared = nextRank(state);
  const pileCount = state.center.reduce((a, g) => a + g.cards.length, 0);
  const doubtable = isHumanTurn && canDoubt(state, HUMAN);
  const canPlay = isHumanTurn && selected.length >= 1;

  const toggleSelect = (i: number) => {
    setSelected(s =>
      s.includes(i) ? s.filter(x => x !== i) : s.length >= MAX_PLAY ? s : [...s, i]
    );
  };

  return (
    <div className="mp-table mp-table-cheat" data-theme={chrome.theme}>
      <MpTopBar title="🕵️ ダウト" {...chrome} onRestart={reStart} />

      <div className="mp-status">
        <span className={`mp-turn ${host.finished ? 'mp-done' : ''}`}>
          {host.finished
            ? 'ゲーム終了'
            : host.currentPlayer === HUMAN
              ? 'あなたの番です(手札から出すカードを選ぶか、ダウトを宣言)'
              : `${host.players[host.currentPlayer!]?.name ?? 'CPU'} の番…`}
        </span>
      </div>

      {/* プレイヤー状況 */}
      <div className="ct-players">
        {host.players.map(p => {
          const isYou = p.id === HUMAN;
          const isActive = state.activePlayers.includes(p.id);
          const isCurrent = !host.finished && p.id === host.currentPlayer;
          return (
            <span
              key={p.id}
              className={`ct-player-chip ${isCurrent ? 'ct-active' : ''} ${isActive ? '' : 'ct-out'} ${isYou ? 'ct-you' : ''}`}
            >
              {isYou ? 'あなた' : p.name}({state.hands[p.id]?.length ?? 0})
              {!isActive && <span className="ct-done-mark">達成</span>}
            </span>
          );
        })}
      </div>

      {/* 場 / 現在の宣言ランク */}
      <div className="ct-center">
        <div className="ct-rank">
          宣言するランク <b className="ct-rank-big">{declared}</b>
        </div>
        <div className="ct-pile">
          {pileCount === 0 ? (
            <span className="ct-pile-empty">場は空です(Aから開始)</span>
          ) : (
            <>
              <div className="ct-pile-cards">
                {Array.from({ length: Math.min(Math.max(pileCount, 1), 6) }).map((_, i) => (
                  <div key={i} className="ct-back-card">
                    <div className="mp-card mp-card-back mp-card-mini">
                      <div className="mp-card-back-pattern">
                        <span>♠</span><span>♣</span><span>♥</span><span>♦</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ct-pile-count">
                場に {pileCount} 枚
                <span className="ct-pile-decl">直近の宣言: {state.center[state.center.length - 1].declaredRank}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 操作 */}
      {isHumanTurn && (
        <div className="ct-actions">
          <button
            className="mp-primary ct-act"
            onClick={() => host.play({ type: 'doubt' })}
            disabled={!doubtable}
          >
            🚨 ダウト！
          </button>
          <button
            className="mp-primary ct-act"
            onClick={() => host.play({ type: 'play', handIndexes: selected })}
            disabled={!canPlay}
          >
            出す ({selected.length}枚)
          </button>
          {selected.length > 0 && (
            <button className="mp-ghost ct-act" onClick={() => setSelected([])}>
              選択クリア
            </button>
          )}
        </div>
      )}

      {/* 自分の手札 */}
      <div className="mp-hand-wrap">
        <div className="mp-hand-label">
          あなたの手札({myHand.length})
          {isHumanTurn && !doubtable && ' — カードを選んで出してください(最大4枚)'}
        </div>
        <div className="mp-hand">
          {myHand.map((c, i) => {
            const isSel = selected.includes(i);
            return (
              <div
                key={c.id}
                className={`mp-card-slot ${isSel ? 'ct-selected' : ''}`}
                style={{ '--i': i } as React.CSSProperties}
              >
                <MpCardView
                  card={c}
                  faceUp
                  small
                  onClick={
                    isHumanTurn
                      ? () => toggleSelect(i)
                      : undefined
                  }
                  disabled={!isHumanTurn}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 結果 */}
      {host.finished && host.results && (
        <div className="mp-overlay">
          <div className="mp-modal">
            <h3>ゲーム終了</h3>
            <ol className="mp-ranking">
              {host.results.map((res, idx) => {
                const isYou = res.playerId === HUMAN;
                const name = isYou ? 'あなた' : host.players[res.playerId]?.name ?? `CPU${res.playerId + 1}`;
                return (
                  <li
                    key={res.playerId}
                    className={`${idx === 0 ? 'mp-first' : ''} ${res.isLoser ? 'mp-loser' : ''}`}
                    style={{ '--i': idx } as React.CSSProperties}
                  >
                    <span className="mp-rank-medal">{res.isLoser ? '🗿' : rankMedal(res.rank)}</span>
                    <span className="mp-rank-name">{name}</span>
                    <span className="mp-rank-note">
                      {res.isLoser ? '👑 ババ(最下位)' : `${res.rank}位`}
                    </span>
                  </li>
                );
              })}
            </ol>
            <MpRecord gameId="cheat" />
            <button className="mp-primary" onClick={reStart}>もう一度</button>
            <button className="mp-ghost" onClick={() => (window.location.hash = '/')}>メニューへ</button>
          </div>
        </div>
      )}
    </div>
  );
};
