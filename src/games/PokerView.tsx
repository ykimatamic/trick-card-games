import React, { useMemo, useState } from 'react';
import { useTurnHost } from './contract';
import { pokerDef, kindLabel, evaluateHand } from './poker';
import type { PokerState, PokerAction } from './poker';
import { MpCardView } from './MpCardView';
import { MpTopBar } from './MpTopBar';
import { MpRecord } from './MpRecord';
import { loadChips, saveChips } from './gameStats';
import { useMpChrome, rankMedal } from './MpChrome';
import * as snd from '../sound';
import './games.css';

interface PokerViewProps {
  initialPlayers?: number;
  initialChips?: number;
  initialAnte?: number;
}

const HUMAN = 0;

const PHASE_LABEL: Record<PokerState['phase'], string> = {
  bet1: 'ベット',
  draw: 'カード交換',
  bet2: 'ベット',
  next: 'ハンド結果',
  done: '終了',
};

export const PokerView: React.FC<PokerViewProps> = ({
  initialPlayers = 3,
  initialChips = 500,
  initialAnte = 10,
}) => {
  const chrome = useMpChrome();
  const host = useTurnHost<PokerState, PokerAction>(pokerDef, {
    cpuDelayMs: 900,
    humanPlayerId: HUMAN,
    rng: Math.random,
    onApply: (_prev, next) => {
      if (next.done) {
        saveChips('poker', next.chips[HUMAN]);
        snd.playWin();
      } else {
        snd.playDraw();
      }
    },
  });
  const [selectedPlayers, setSelectedPlayers] = useState(initialPlayers);
  const [selectedChips, setSelectedChips] = useState<number>(() => loadChips('poker') ?? initialChips);
  const [selectedAnte, setSelectedAnte] = useState(initialAnte);
  const [discarding, setDiscarding] = useState<Set<number>>(new Set());

  const startGame = () =>
    host.start(selectedPlayers, 'あなた', { startChips: selectedChips, ante: selectedAnte });
  const reStart = () => startGame();

  const state = host.gameState;
  const isHumanTurn =
    host.currentPlayer === HUMAN && !host.finished && state !== null;

  const isBetting =
    state !== null && !state.done && (state.phase === 'bet1' || state.phase === 'bet2');
  const isDraw = state !== null && !state.done && state.phase === 'draw';

  // 自分の現役を評価(ショウダウン前に表示)
  const myHandLabel = useMemo(() => {
    if (!state || state.folded[HUMAN]) return null;
    return kindLabel(evaluateHand(state.hands[HUMAN]).kind);
  }, [state]);

  if (!state || host.players.length === 0) {
    return (
      <div className="mp-table mp-table-poker" data-theme={chrome.theme}>
        <MpTopBar title="🃏 ポーカー(5カードドロー)" {...chrome} />
        <div className="mp-lobby">
          <h2 className="mp-lobby-title">🃏 ポーカー</h2>
          <p className="mp-lobby-desc">
            5カードドロー。ベット → 交換 → ベット → ショウダウン。最も強い役がポットを獲得します。
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
          <span className="mp-lobby-label">開始チップ / アンティ</span>
          <div className="mp-lobby-row">
            {[300, 500, 1000].map(n => (
              <button
                key={n}
                type="button"
                className={`mp-lobby-chip ${selectedChips === n ? 'mp-selected' : ''}`}
                onClick={() => setSelectedChips(n)}
              >
                {n}
              </button>
            ))}
            <span className="mp-lobby-gap">× アンティ</span>
            {[10, 20, 50].map(n => (
              <button
                key={n}
                type="button"
                className={`mp-lobby-chip ${selectedAnte === n ? 'mp-selected' : ''}`}
                onClick={() => setSelectedAnte(n)}
              >
                {n}
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

  const myHand = state.hands[HUMAN];
  const pot = state.pot;

  const toggleDiscard = (idx: number) => {
    if (!isDraw || !isHumanTurn) return;
    setDiscarding(prev => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx);
      else n.add(idx);
      return n;
    });
  };

  const commitDiscard = () => {
    if (!state) return;
    const ok = host.play({ type: 'discard', indexes: [...discarding] });
    if (ok) setDiscarding(new Set());
  };

  const canRaise =
    state.chips[HUMAN] + state.roundBets[HUMAN] > state.currentBet;
  const raiseAmount = Math.max(state.ante, 1);

  // ショウダウン(手札開示)リスト。次ハンドへの一時停止時とマッチ終了時の両方で再利用
  const showdownList = state.showdown ? (
    <ol className="pk-showdown">
      {state.showdown.map((sd, idx) => {
        const isYou = sd.playerId === HUMAN;
        const name = isYou ? 'あなた' : host.players[sd.playerId]?.name ?? `CPU${sd.playerId + 1}`;
        const isWinner = sd.playerId === state.winner;
        return (
          <li key={sd.playerId} className={isWinner ? 'pk-first' : ''}>
            <span>{isWinner ? '👑' : rankMedal(idx + 1)}</span>
            <div className="pk-sd-body">
              <div className="pk-sd-head">
                <span className="pk-sd-name">{name}</span>
                <span className="pk-sd-kind">{sd.kind === 'royal flush' ? '🃏 ' : ''}{sd.label}</span>
              </div>
              <div className="pk-sd-cards">
                {state.hands[sd.playerId].map((c, i) => (
                  <MpCardView key={`${sd.playerId}-${i}-${c.id}`} card={c} faceUp small />
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  ) : null;

  return (
    <div className="mp-table mp-table-poker" data-theme={chrome.theme}>
      <MpTopBar title="🃏 ポーカー(5カードドロー)" {...chrome} onRestart={reStart} />

      <div className="mp-status">
        <span className={`mp-turn ${host.finished ? 'mp-done' : ''}`}>
          {host.finished
            ? 'ゲーム終了'
            : isBetting
              ? host.currentPlayer === HUMAN
                ? 'あなたの番です(フォールド / コール / レイズ)'
                : `${host.players[host.currentPlayer!]?.name ?? 'CPU'} がベット…`
              : isDraw
                ? host.currentPlayer === HUMAN
                  ? '捨てるカードを選んで「交換」(0枚のままでも可)'
                  : `${host.players[host.currentPlayer!]?.name ?? 'CPU'} がカード交換…`
                : '…'}
        </span>
      </div>

      {/* ポットとフェーズ */}
      <div className="pk-table-info">
        <span className="pk-pot">
          ポット <b>{pot}</b>
        </span>
        <span className="pk-phase">{PHASE_LABEL[state.phase]}</span>
        {state.currentBet > 0 && isBetting && (
          <span className="pk-current-bet">現在の掛金 {state.currentBet}</span>
        )}
        {state.match && (
          <span className="pk-hand-progress">ハンド {state.handNumber}/{state.maxHands}</span>
        )}
      </div>

      {/* 相手プレイヤー */}
      <div className="mp-opponents">
        {host.players.map(p => {
          if (p.id === HUMAN) return null;
          const isOut = state.folded[p.id];
          const isCurrent = !host.finished && isBetting && p.id === host.currentPlayer;
          const revealed = !!state.showdown?.some(sd => sd.playerId === p.id);
          return (
            <div
              key={p.id}
              className={`mp-opponent ${isCurrent ? 'mp-opponent-active' : ''} ${isOut ? 'mp-opponent-out' : ''}`}
            >
              <div className="mp-opponent-name">
                {p.name}
                {isOut && <span className="mp-badge-out">フォールド</span>}
              </div>
              <div className="mp-opponent-cards">
                {state.hands[p.id].map((c, i) => (
                  <div
                    key={`${p.id}-${i}-${c.id}`}
                    className="mp-opponent-card"
                    style={{ marginLeft: i === 0 ? 0 : -14 }}
                  >
                    {revealed ? (
                      <MpCardView card={c} faceUp small />
                    ) : (
                      <div className="mp-card mp-card-back mp-card-mini">
                        <div className="mp-card-back-pattern">
                          <span>♠</span><span>♣</span><span>♥</span><span>♦</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="pk-chip-line">
                <span className={`pk-chip ${state.chips[p.id] <= 0 ? 'pk-broke' : ''}`}>
                  {state.chips[p.id]} 枚
                </span>
                {isBetting && <span className="pk-round-bet">賭け {state.roundBets[p.id]}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* 自分の手札 */}
      <div className="mp-hand-wrap">
        <div className="mp-hand-label">
          あなたの手札
          {!state.folded[HUMAN] && !state.done && myHandLabel && (
            <span className="pk-hand-strength">{myHandLabel}</span>
          )}
          <span className="pk-chip pk-me">チップ {state.chips[HUMAN]} 枚</span>
        </div>
        <div className="mp-hand">
          {myHand.map((c, i) => (
            <div
              key={c.id}
              className={`mp-card-slot ${discarding.has(i) ? 'pk-discard-tag' : ''}`}
              style={{ '--i': i } as React.CSSProperties}
            >
              <MpCardView
                card={c}
                faceUp
                onClick={isDraw && isHumanTurn ? () => toggleDiscard(i) : undefined}
              />
              {isDraw && isHumanTurn && discarding.has(i) && (
                <span className="pk-discard-mark">交換</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 操作 */}
      <div className="pk-actions">
        {isBetting && host.currentPlayer === HUMAN && (
          <>
            <button className="pk-act pk-fold" onClick={() => host.play({ type: 'fold' })}>
              フォールド
            </button>
            <button className="mp-primary pk-act" onClick={() => host.play({ type: 'call' })}>
              コール {state.currentBet - state.roundBets[HUMAN] > 0 ? `(${state.currentBet - state.roundBets[HUMAN]})` : ''}
            </button>
            <button
              className="mp-ghost pk-act"
              disabled={!canRaise}
              onClick={() => host.play({ type: 'raise', amount: raiseAmount })}
            >
              レイズ +{raiseAmount}
            </button>
          </>
        )}
        {isDraw && host.currentPlayer === HUMAN && (
          <button
            className="mp-primary pk-act pk-swap"
            onClick={commitDiscard}
          >
            交換({discarding.size}枚)
          </button>
        )}
        {(isBetting || isDraw) && host.currentPlayer !== HUMAN && (
          <div className="pk-waiting">待機中…</div>
        )}
      </div>

      {/* ショウダウン(ハンドの勝負)で手札を開示し、次のハンドへ一時停止 */}
      {!host.finished && state.phase === 'next' && state.showdown && (
        <div className="mp-overlay">
          <div className="mp-modal">
            <h3>ハンド {state.handNumber} の勝負</h3>
            <p className="pk-showdown-title">ショウダウン(手札を開示)</p>
            {showdownList}
            <div className="mp-modal-row">
              <button className="mp-primary" onClick={() => host.play({ type: 'next' })}>
                次のハンドへ
              </button>
              <button className="mp-ghost" onClick={reStart}>もう一度</button>
            </div>
          </div>
        </div>
      )}

      {/* 結果 / ショウダウン */}
      {host.finished && (
        <div className="mp-overlay">
          <div className="mp-modal">
            <h3>{state.match ? `マッチ終了(${state.handNumber}ハンド戦)` : 'ゲーム終了'}</h3>
            {host.results && (
              <ol className="pk-standings">
                {host.results.map(r => {
                  const isYou = r.playerId === HUMAN;
                  const name = isYou ? 'あなた' : host.players[r.playerId]?.name ?? `CPU${r.playerId + 1}`;
                  return (
                    <li key={r.playerId} className={r.rank === 1 ? 'pk-first' : ''}>
                      <span>{r.rank === 1 ? '👑' : rankMedal(r.rank)}</span>
                      <span className="pk-sd-name">{name}</span>
                      <span className={`pk-chip ${state.chips[r.playerId] <= 0 ? 'pk-broke' : ''}`}>
                        {state.chips[r.playerId]} 枚
                      </span>
                      {state.chips[r.playerId] <= 0 && <span className="mp-badge-out">破産</span>}
                    </li>
                  );
                })}
              </ol>
            )}
            {state.showdown ? (
              <>
                <p className="pk-showdown-title">最終ハンド(手札を開示)</p>
                {showdownList}
              </>
            ) : (
              <p className="pk-fold-result">最終ハンドは全員フォールドのため勝者なし</p>
            )}
            <p className="pk-chip-total">
              あなたの最終チップ: <b>{state.chips[HUMAN]}</b> 枚
              {state.chips[HUMAN] <= 0 && ' (破産)'}
            </p>
            <MpRecord gameId="poker" />
            <div className="mp-modal-row">
              <button className="mp-primary" onClick={reStart}>
                もう一度
              </button>
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
