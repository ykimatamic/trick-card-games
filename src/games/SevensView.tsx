import React, { useState } from 'react';
import { useTurnHost } from './contract';
import { sevensDef, playableCards } from './sevens';
import type { SevensState, SevensAction } from './sevens';
import { MpCardView } from './MpCardView';
import { MpTopBar } from './MpTopBar';
import { MpRecord } from './MpRecord';
import { useMpChrome, rankMedal } from './MpChrome';
import { SUITS, RANKS, RANK_VALUES } from '../types';
import * as snd from '../sound';
import './games.css';

interface SevensViewProps {
  initialPlayers?: number;
}

const HUMAN = 0;
const SUIT_JP: Record<string, string> = {
  hearts: 'ハート',
  diamonds: 'ダイヤ',
  clubs: 'クラブ',
  spades: 'スペード',
};

export const SevensView: React.FC<SevensViewProps> = ({ initialPlayers = 3 }) => {
  const chrome = useMpChrome();
  const host = useTurnHost<SevensState, SevensAction>(sevensDef, {
    cpuDelayMs: 800,
    humanPlayerId: HUMAN,
    onApply: (_prev, next, action) => {
      if (next.done) {
        snd.playWin();
      } else if (action.kind === 'play') {
        snd.playFoundation();
      } else {
        snd.playUndo();
      }
    },
  });
  const [selectedPlayers, setSelectedPlayers] = useState(initialPlayers);

  const startGame = () => host.start(selectedPlayers, 'あなた');
  const reStart = () => startGame();

  const state = host.gameState;
  const isHumanTurn = host.currentPlayer === HUMAN && !host.finished && !!state;

  const myHand = state?.hands[HUMAN] ?? [];
  const myPlayable = state ? playableCards(state, HUMAN) : [];
  const myPlayableSet = new Set(myPlayable);

  if (!state || host.players.length === 0) {
    return (
      <div className="mp-table mp-table-sevens" data-theme={chrome.theme}>
        <MpTopBar title="♠ 7並べ" {...chrome} />
        <div className="mp-lobby">
          <h2 className="mp-lobby-title">♠ 7並べ</h2>
          <p className="mp-lobby-desc">
            各スートの7を起点に、前後へ数字をつないでカードを出していきます。最初に手札を出し切った人が勝ち。
          </p>
          <span className="mp-lobby-label">プレイヤー数</span>
          <div className="mp-lobby-chips">
            {[2, 3, 4, 5, 6, 7].map(n => (
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

  return (
    <div className="mp-table mp-table-sevens" data-theme={chrome.theme}>
      <MpTopBar title="♠ 7並べ" {...chrome} onRestart={reStart} />

      <div className="mp-status">
        <span className={`mp-turn ${host.finished ? 'mp-done' : ''}`}>
          {host.finished
            ? 'ゲーム終了'
            : host.currentPlayer === HUMAN
              ? 'あなたの番です(手札に出せるカードを選んでください)'
              : `${host.players[host.currentPlayer!]?.name ?? 'CPU'} の番…`}
        </span>
      </div>

      {/* 場(スート別レーン) */}
      <div className="sv-table">
        {SUITS.map(suit => (
          <div key={suit} className="sv-row">
            <div className="sv-suit-label" style={{ color: suit === 'spades' || suit === 'clubs' ? '#e8ecf2' : '#e74c3c' }}>
              {SUIT_JP[suit]}
            </div>
            <div className="sv-slots">
              {RANKS.map(rank => {
                const key = `${suit}:${RANK_VALUES[rank]}`;
                const pc = state.played.get(key);
                const placed = rank === '7' ? 0 : (RANK_VALUES[rank] > 7 ? RANK_VALUES[rank] - 7 : 7 - RANK_VALUES[rank]);
                return (
                  <div
                    key={rank}
                    className={`sv-slot ${rank === '7' ? 'sv-sevens' : ''}`}
                    style={{ '--i': placed } as React.CSSProperties }
                  >
                    {pc ? (
                      <MpCardView card={pc} faceUp small />
                    ) : (
                      <div className="sv-empty">{rank === '7' ? '7' : ''}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 上がり状況 */}
      <div className="sv-players">
        {host.players.map(p => (
          <span
            key={p.id}
            className={`sv-player-chip ${p.id === HUMAN ? 'sv-you' : ''} ${host.finished ? '' : p.id === host.currentPlayer ? 'sv-active' : ''}`}
          >
            {p.id === HUMAN ? 'あなた' : p.name}({state.hands[p.id]?.length ?? 0})
          </span>
        ))}
      </div>

      {/* 自分の手札 */}
      <div className="mp-hand-wrap">
        <div className="mp-hand-label">
          あなたの手札({myHand.length})
          {isHumanTurn && myPlayable.length === 0 && ' — 出せるカードがありません'}
        </div>
        <div className="mp-hand">
          {myHand.map((c, i) => (
            <div
              key={c.id}
              className={`mp-card-slot ${isHumanTurn && myPlayableSet.has(i) ? 'sv-card-playable' : ''}`}
              style={{ '--i': i } as React.CSSProperties }
            >
              <MpCardView
                card={c}
                faceUp
                small
                onClick={
                  isHumanTurn && myPlayableSet.has(i)
                    ? () => host.play({ kind: 'play', handIndex: i })
                    : undefined
                }
                disabled={!(isHumanTurn && myPlayableSet.has(i))}
              />
            </div>
          ))}
        </div>
        {isHumanTurn && (
          <div className="sv-actions">
            {myPlayable.length === 0 && (
              <button className="mp-primary" onClick={() => host.play({ kind: 'pass' })}>
                パス
              </button>
            )}
          </div>
        )}
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
                    style={{ '--i': idx } as React.CSSProperties }
                  >
                    <span className="mp-rank-medal">{res.isLoser ? '🗿' : rankMedal(res.rank)}</span>
                    <span className="mp-rank-name">{name}</span>
                    <span className="mp-rank-note">
                      {res.isLoser ? '🙁 最下位' : `${res.rank}位`}
                    </span>
                  </li>
                );
              })}
            </ol>
            <MpRecord gameId="sevens" />
            <button className="mp-primary" onClick={reStart}>もう一度</button>
            <button className="mp-ghost" onClick={() => (window.location.hash = '/')}>メニューへ</button>
          </div>
        </div>
      )}
    </div>
  );
};