import { createPlayingDeck, shuffleCards, rankValue, type MpCard } from './cards';
import type { TurnGameDef } from './contract';

/**
 * 7並べ(Fan Tan / Sevens)
 *
 * - 52枚(ジョーカーなし)をプレイヤーへ均等配布
 * - ♠7 を持つプレイヤーが最初に出す
 * - 各スートは7を起点に、7より上は(rank-1)が、7より下は(rank+1)が既に出ているカードのみ出せる
 * - 新たに他のスートの7を出すことでそのスートを開始できる
 * - 出せるカードが無ければパス(ターンは次の人へ)
 * - 手札が空になった順に上位。残り1人になったら終了(その人が最下位)
 */

export interface SevensState {
  hands: MpCard[][];
  currentPlayer: number;
  /** 'suit:rank' -> 場に出たカード */
  played: Map<string, MpCard>;
  /** 上がり順(先頭=最上位) */
  order: number[];
  /** まだ手札のあるプレイヤー */
  hasCards: boolean[];
  /** 連続パス回数(誰かが出せば 0 に戻る)。全周に達したら詰み判定 */
  consecutivePasses: number;
  done: boolean;
}

export type SevensAction = { kind: 'play'; handIndex: number } | { kind: 'pass' };

const START_SUIT = 'spades';
const RANK7 = 7;

/** 7より上/下の出せる条件を判定(キーは数値ランクで統一) */
export function isPlayable(card: MpCard, played: Map<string, MpCard>): boolean {
  const v = rankValue(card);
  if (v === RANK7) {
    // 同じスートの7がまだ出ていなければ開始可能
    return !played.has(`${card.suit}:${RANK7}`);
  }
  const neighborRank = v > RANK7 ? v - 1 : v + 1;
  const key = `${card.suit}:${neighborRank}`;
  return played.has(key);
}

export function setup(playerCount: number, rng: () => number = Math.random): SevensState {
  const deck = shuffleCards(createPlayingDeck(0), rng);
  const hands: MpCard[][] = Array.from({ length: playerCount }, () => []);
  deck.forEach((c, i) => hands[i % playerCount].push({ ...c, faceUp: true }));

  const played = new Map<string, MpCard>();
  const order: number[] = [];
  const hasCards = hands.map(h => h.length > 0);

  // ♠7 を持つプレイヤーから開始(最初に出すカードは ♠7)
  let starter = -1;
  outer: for (let p = 0; p < playerCount; p++) {
    for (const c of hands[p]) {
      if (c.suit === START_SUIT && c.rank === '7') {
        starter = p;
        break outer;
      }
    }
  }
  if (starter === -1) starter = 0;

  return {
    hands,
    currentPlayer: starter,
    played,
    order,
    hasCards,
    consecutivePasses: 0,
    done: playerCount <= 0,
  };
}

function nextActive(state: SevensState, from: number): number {
  const n = state.hands.length;
  for (let step = 1; step <= n; step++) {
    const p = (from + step) % n;
    if (state.hasCards[p]) return p;
  }
  return -1;
}

export function current(state: SevensState): number | null {
  return state.done ? null : state.currentPlayer;
}

/** 現在のプレイヤーが出せる手の一覧 */
export function playableCards(state: SevensState, playerId: number): number[] {
  const hand = state.hands[playerId];
  const res: number[] = [];
  for (let i = 0; i < hand.length; i++) {
    if (isPlayable(hand[i], state.played)) res.push(i);
  }
  return res;
}

export function legalActions(state: SevensState, playerId: number): SevensAction[] {
  if (state.done || playerId !== state.currentPlayer) return [];
  const plays = playableCards(state, playerId).map(handIndex => ({ kind: 'play' as const, handIndex }));
  // 出せるカードがある間はパス不可(無制限パスによる停滞を防ぐ)
  if (plays.length > 0) return plays;
  return [{ kind: 'pass' }];
}

export function apply(state: SevensState, playerId: number, action: SevensAction): SevensState | null {
  if (state.done || playerId !== state.currentPlayer) return null;
  const hand = state.hands[playerId];
  if (hand.length === 0) return null;

  const next: SevensState = {
    hands: state.hands.map(h => [...h]),
    currentPlayer: playerId,
    played: new Map(state.played),
    order: [...state.order],
    hasCards: [...state.hasCards],
    consecutivePasses: state.consecutivePasses,
    done: false,
  };

  if (action.kind === 'play') {
    if (action.handIndex < 0 || action.handIndex >= hand.length) return null;
    const card = hand[action.handIndex];
    if (!isPlayable(card, state.played)) return null;
    next.hands[playerId] = [...hand.slice(0, action.handIndex), ...hand.slice(action.handIndex + 1)];
    next.played.set(`${card.suit}:${rankValue(card)}`, card);
    // 誰かが出せば連続パスはリセット
    next.consecutivePasses = 0;
  } else {
    // pass の場合は何も置かず、連続パスを加算
    next.consecutivePasses = state.consecutivePasses + 1;
  }

  // 上がり判定
  if (next.hands[playerId].length === 0 && next.hasCards[playerId]) {
    next.hasCards[playerId] = false;
    next.order.push(playerId);
  }

  // 残り1人以下なら終了
  const remaining = next.hasCards.filter(Boolean).length;
  if (remaining <= 1) {
    next.done = true;
    if (remaining === 1) {
      const last = next.hasCards.indexOf(true);
      if (last >= 0 && !next.order.includes(last)) {
        next.order.push(last);
      }
    }
    next.currentPlayer = remaining === 1 ? next.hasCards.indexOf(true) : -1;
    return next;
  }

  // 全周(残り全員)が連続パスし出せるカードが無い = 詰み。
  // 手札の少ない順に残り順位を確定させて終了する
  if (next.consecutivePasses >= remaining) {
    const stuck = next.hasCards
      .map((on, p) => (on ? p : -1))
      .filter(p => p >= 0)
      .sort((a, b) => next.hands[a].length - next.hands[b].length);
    for (const p of stuck) {
      if (!next.order.includes(p)) next.order.push(p);
    }
    next.done = true;
    next.currentPlayer = -1;
    return next;
  }

  next.currentPlayer = nextActive(next, playerId);
  return next;
}

export function isFinished(state: SevensState): boolean {
  return state.done;
}

export function results(state: SevensState): { playerId: number; rank: number; isLoser: boolean }[] {
  const n = state.order.length;
  return state.order.map((pid, i) => ({
    playerId: pid,
    rank: i + 1,
    isLoser: i === n - 1 && n > 1,
  }));
}

/** CPU: 出せるカードがあれば最小ランクのものを出す。無ければパス */
export function cpuPick(state: SevensState, playerId: number): SevensAction {
  const plays = playableCards(state, playerId);
  if (plays.length === 0) return { kind: 'pass' };
  let best = plays[0];
  for (const i of plays) {
    if (rankValue(state.hands[playerId][i]) < rankValue(state.hands[playerId][best])) {
      best = i;
    }
  }
  return { kind: 'play', handIndex: best };
}

export const sevensDef: TurnGameDef<SevensState, SevensAction> = {
  id: 'sevens',
  setup,
  currentPlayer: current,
  legalActions,
  apply,
  isFinished,
  results,
  chooseCpuAction: cpuPick,
};
