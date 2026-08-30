import React, { useState, useEffect } from 'react';
import { useTurnHost } from './contract';
import {
  daifugoDef,
  classifyCombo,
  beats,
  canLead,
  valueOf,
  titleForRank,
  legalCombos,
  type DaifugoState,
  type DaifugoAction,
  type Combo,
} from './daifugo';
import { MpCardView } from './MpCardView';
import { MpTopBar } from './MpTopBar';
import { MpRecord } from './MpRecord';
import { useMpChrome, rankMedal } from './MpChrome';
import * as snd from '../sound';
import './games.css';

interface DaifugoViewProps {
  initialPlayers?: number;
}

const HUMAN = 0;

function comboLabel(c: Combo): string {
  switch (c.kind) {
    case 'single': return `${c.cards[0].rank === 'JOKER' ? 'ジョーカー' : c.cards[0].rank} (1枚)`;
    case 'pair': return `ペア(${c.cards[0].rank})`;
    case 'triple': return `トリプル(${c.cards[0].rank})`;
    case 'four': return `フォー(${c.cards[0].rank})`;
    case 'straight': return `階段(${c.length}連)`;
    case 'double': return `ダブル階段(${c.length}連)`;
  }
}

function sortHand(cards: any[]): any[] {
  return [...cards].sort((a, b) => {
    if (a.rank === 'JOKER') return 1;
    if (b.rank === 'JOKER') return -1;
    if (valueOfValid(a) !== valueOfValid(b)) return valueOfValid(a) - valueOfValid(b);
    return (a.suit.charCodeAt(0)) - (b.suit.charCodeAt(0));
  });
}
function valueOfValid(c: any): number {
  return c.rank === 'JOKER' ? 14 : valueOf(c);
}

export const DaifugoView: React.FC<DaifugoViewProps> = ({ initialPlayers = 4 }) => {
  const chrome = useMpChrome();
  const host = useTurnHost<DaifugoState, DaifugoAction>(daifugoDef, {
    cpuDelayMs: 800,
    humanPlayerId: HUMAN,
    onApply: (prev, next, action) => {
      if (next.done) {
        snd.playWin();
      } else if (action.kind === 'play') {
        snd.playPlace();
        if (next.revolution !== prev.revolution) {
          snd.playFoundation();
        }
      } else {
        snd.playUndo();
      }
    },
  });
  const [selectedPlayers, setSelectedPlayers] = useState(initialPlayers);
  const [selected, setSelected] = useState<number[]>([]);
  // 10捨て: 単体の10を出した後、捨てるカードを選んでいる最中の"出すカード"の index
  const [pendingPlay, setPendingPlay] = useState<number[] | null>(null);

  const state = host.gameState;
  const isHumanTurn = host.currentPlayer === HUMAN && !host.finished && !!state;

  useEffect(() => {
    if (!state) return;
    setSelected([]);
    setPendingPlay(null);
  }, [host.currentPlayer, state]);

  const startGame = () => {
    setSelected([]);
    host.start(selectedPlayers, 'あなた');
  };
  const nextGame = () => {
    // 前回結果(順位)をもとに次ゲームのカード交換を設定
    let context: { previousRanks?: number[] } | undefined;
    if (state && host.results) {
      const ranks: number[] = [];
      host.results.forEach(res => { ranks[res.playerId] = res.rank; });
      context = { previousRanks: ranks };
    }
    setSelected([]);
    host.start(host.players.length, 'あなた', context);
  };
  const reStart = () => startGame();

  const myHand = state?.hands[HUMAN] ?? [];
  const myTurn = isHumanTurn;
  const lead = state ? canLead(state, HUMAN) : true;
  const trick = state?.trick ?? null;

  // この場で出せる札だけ自動ハイライト(出せる組み合わせに参加するカードの index 集合)
  const playableIdx = new Set<number>();
  if (isHumanTurn && state) {
    for (const { indices } of legalCombos(state, HUMAN)) {
      indices.forEach(i => playableIdx.add(i));
    }
  }

  const toggle = (i: number) => {
    if (!myTurn) return;
    setSelected(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
    );
  };

  const selectedCombo = ((): Combo | null => {
    if (selected.length === 0) return null;
    return classifyCombo(selected.map(i => myHand[i]));
  })();

  const canPlaySelection = (): boolean => {
    if (!selectedCombo) return false;
    if (lead) return true;
    return !!trick && beats(selectedCombo, trick, state!.revolution);
  };

  // 10捨て: 単体の10を出してまだ手札が残る場合、捨てるカードを選ばせる
  const isDiscardPlay = (combo: Combo): boolean =>
    combo.kind === 'single' && combo.cards[0].rank === '10' && selected.length < myHand.length;

  const doPlay = () => {
    if (!selectedCombo || !canPlaySelection()) return;
    const combo = selectedCombo;
    // 10捨てで捨てカード選びが必要なら、まずそのフェーズへ
    if (isDiscardPlay(combo)) {
      setPendingPlay([...selected]);
      return;
    }
    host.play({ kind: 'play', indices: selected });
  };
  const commitDiscard = (discardIdx?: number) => {
    if (pendingPlay) {
      host.play({ kind: 'play', indices: pendingPlay, discardIdx });
    }
    setPendingPlay(null);
  };
  const doPass = () => {
    host.play({ kind: 'pass' });
  };

  if (!state || host.players.length === 0) {
    return (
      <div className="mp-table mp-table-daifugo" data-theme={chrome.theme}>
        <MpTopBar title="👑 大富豪" {...chrome} />
        <div className="mp-lobby">
          <h2 className="mp-lobby-title">👑 大富豪</h2>
          <p className="mp-lobby-desc">
            数字の大小でカードを出し合い、最初に手札をなくした人が大富豪。革命・8切り・10捨て付き。
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

  const sortedHand = sortHand(myHand.slice());
  const idxByCardId = new Map<string, number>();
  myHand.forEach((c, i) => idxByCardId.set(c.id, i));

  return (
    <div className="mp-table mp-table-daifugo" data-theme={chrome.theme}>
      <MpTopBar title="👑 大富豪" {...chrome} onRestart={reStart} />

      <div className="mp-status">
        <span className={`mp-turn ${host.finished ? 'mp-done' : ''}`}>
          {state.revolution && <span className="df-rev-badge">革命中</span>}
          {host.finished
            ? 'ゲーム終了'
            : host.currentPlayer === HUMAN
              ? 'あなたの番です(出せる札が光っています)'
              : `${host.players[host.currentPlayer!]?.name ?? 'CPU'} の番…`}
        </span>
      </div>

      {/* 上がり順(称号) */}
      <div className="df-ranks">
        {host.players.map(p => {
          const inOrder = state.order.indexOf(p.id);
          return (
            <span
              key={p.id}
              className={`df-rank-chip ${p.id === HUMAN ? 'df-you' : ''} ${p.id === host.currentPlayer && !host.finished ? 'df-active' : ''} ${inOrder >= 0 ? 'df-out' : ''}`}
            >
              {p.id === HUMAN ? 'あなた' : p.name}
              <span className="df-count">{state.hands[p.id]?.length ?? 0}枚</span>
              {inOrder >= 0 && <span className="df-badge">{titleForRank(inOrder + 1)}</span>}
            </span>
          );
        })}
      </div>

      {/* 場(現在のコンボ) */}
      <div className="df-trick">
        {trick ? (
          <>
            <div className="df-trick-label">
              {state.trickOwner === HUMAN ? 'あなた' : (host.players[state.trickOwner!]?.name ?? 'CPU')}
              {' '}が <b>{comboLabel(trick)}</b> を出しました
            </div>
            <div className="df-trick-cards">
              {trick.cards.map(c => (
                <MpCardView key={c.id} card={c} faceUp small />
              ))}
            </div>
          </>
        ) : (
          <div className="df-trick-empty">場は流れました — 新しい親が出します</div>
        )}
      </div>

      {/* 自分の手札 */}
      <div className="mp-hand-wrap">
        <div className="mp-hand-label">
          あなたの手札({myHand.length})
          {pendingPlay ? (
            <span className="df-selinfo"> — 10捨て: 捨てるカードを1枚クリック(スキップ可)</span>
          ) : (
            <>
              {selectedCombo && (
                <span className="df-selinfo">
                  {' '}選択: {comboLabel(selectedCombo)}
                  {canPlaySelection() ? ' ✅' : ' ✖'}
                </span>
              )}
              {state.revolution && <span className="df-selinfo"> — 革命中は弱い数字の方が強い</span>}
              {!myTurn && <span className="df-selinfo"> (待機中)</span>}
            </>
          )}
        </div>
        <div className="mp-hand">
          {sortedHand.map((c, idx) => {
            const i = idxByCardId.get(c.id)!;
            const isSel = selected.includes(i);
            const inDiscard = pendingPlay?.includes(i) ?? false;
            const clickable = myTurn;
            const isPlayable = clickable && playableIdx.has(i);
            const onClick = pendingPlay
              ? () => { if (!inDiscard) commitDiscard(i); }
              : () => toggle(i);
            return (
              <div
                key={c.id}
                className={`mp-card-slot df-card-slot ${isSel ? 'df-selected' : ''} ${inDiscard ? 'df-inplay' : ''} ${clickable ? 'df-clickable' : ''} ${isPlayable ? 'df-playable' : ''}`}
                style={{ '--i': idx } as React.CSSProperties }
                onClick={onClick}
              >
                <MpCardView card={c} faceUp small disabled={!clickable} />
              </div>
            );
          })}
        </div>
        {myTurn && (
          <div className="sv-actions df-actions">
            {pendingPlay ? (
              <>
                <button className="mp-primary" onClick={() => commitDiscard()}>捨てないで出す</button>
                <button className="mp-ghost" onClick={() => setPendingPlay(null)}>もう一度選ぶ</button>
              </>
            ) : (
              <>
                <button className="mp-primary" onClick={doPlay} disabled={!canPlaySelection()}>
                  出す{selectedCombo && canPlaySelection() ? ` (${comboLabel(selectedCombo)})` : ''}
                </button>
                {!lead && (
                  <button className="mp-ghost" onClick={doPass}>パス</button>
                )}
                <button className="mp-ghost" onClick={() => setSelected([])}>選択クリア</button>
              </>
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
                      <b>{titleForRank(res.rank)}</b>{' '}
                      {res.isLoser ? '🙁 最下位' : `${res.rank}位`}
                    </span>
                  </li>
                );
              })}
            </ol>
            <MpRecord gameId="daifugo" />
            <button className="mp-primary" onClick={nextGame}>次のゲーム(カード交換)</button>
            <div className="mp-modal-row">
              <button className="mp-ghost" onClick={reStart}>並び直して最初から</button>
              <button className="mp-ghost" onClick={() => (window.location.hash = '/')}>メニューへ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};