import { createPlayingDeck, shuffleCards, isJoker, type MpCard } from './cards';
import type { TurnGameDef } from './contract';

export interface OldMaidState {
  /** 各プレイヤーの手札(非公開) */
  hands: MpCard[][];
  /** ターン中のプレイヤー番号 */
  currentPlayer: number;
  /** まだ手札のあるプレイヤー(順番通り)。currentPlayer はこの中の誰か */
  activePlayers: number[];
  /** 上がり順。先頭=最上位(最初に手札ゼロになった人)。最後=ババ持ち(敗者) */
  order: number[];
  done: boolean;
}

export type OldMaidAction = { cardIndex: number };

/** 手札から同ランクペアを除去する */
export function removePairs(hand: MpCard[]): MpCard[] {
  const counts = new Map<string, number>();
  const playersByRank = new Map<string, MpCard[]>();
  for (const c of hand) {
    if (isJoker(c)) continue;
    const key = c.rank;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!playersByRank.has(key)) playersByRank.set(key, []);
    playersByRank.get(key)!.push(c);
  }
  const kept: MpCard[] = [];
  for (const [key, cards] of [...playersByRank]) {
    const count = counts.get(key)!;
    const discardCount = count - (count % 2);
    const keepCards = cards.slice(discardCount);
    kept.push(...keepCards);
  }
  for (const c of hand) {
    if (isJoker(c)) kept.push(c);
  }
  return kept;
}

/** 直近の activePlayers から指定プレイヤーのインデックスを求める */
function activeIndex(state: OldMaidState, playerId: number): number {
  return state.activePlayers.indexOf(playerId);
}

/** ターン中のプレイヤーの「次のプレイヤー」(カードを引かれる側) */
export function targetOf(state: OldMaidState): number | null {
  const i = activeIndex(state, state.currentPlayer);
  if (i < 0 || state.activePlayers.length < 2) return null;
  return state.activePlayers[(i + 1) % state.activePlayers.length];
}

export function setup(playerCount: number, rng: () => number = Math.random): OldMaidState {
  const deck = shuffleCards(createPlayingDeck(1), rng);
  const hands: MpCard[][] = Array.from({ length: playerCount }, () => []);
  deck.forEach((c, i) => {
    hands[i % playerCount].push({ ...c, faceUp: false });
  });
  for (let p = 0; p < playerCount; p++) {
    hands[p] = removePairs(hands[p]);
    // ジョーカーが常に一番右にならないよう、ペア除去後に手札をシャッフルする
    hands[p] = shuffleCards(hands[p], rng);
  }
  const activePlayers = Array.from({ length: playerCount }, (_, i) => i).filter(p => hands[p].length > 0);
  // 配布直後に手札ゼロ(上がり)のプレイヤーは order の先頭へ
  const order: number[] = [];
  for (let p = 0; p < playerCount; p++) {
    if (hands[p].length === 0) order.push(p);
  }
  // セットアップ時点で残り1人(ババ持ち)まで確定した場合は、そのプレイヤーを最後(敗者)に加える
  if (activePlayers.length === 1 && !order.includes(activePlayers[0])) {
    order.push(activePlayers[0]);
  }
  return {
    hands,
    currentPlayer: activePlayers.length > 0 ? activePlayers[0] : 0,
    activePlayers,
    order,
    done: activePlayers.length <= 1,
  };
}

export function current(state: OldMaidState): number | null {
  return state.done ? null : state.currentPlayer;
}

export function legalActions(state: OldMaidState, playerId: number): OldMaidAction[] {
  if (state.done) return [];
  if (playerId !== state.currentPlayer) return [];
  const target = targetOf(state);
  if (target === null) return [];
  const targetHand = state.hands[target];
  if (targetHand.length === 0) return [];
  return targetHand.map((_, i) => ({ cardIndex: i }));
}

export function apply(state: OldMaidState, playerId: number, action: OldMaidAction): OldMaidState | null {
  if (state.done) return null;
  if (playerId !== state.currentPlayer) return null;
  const target = targetOf(state);
  if (target === null) return null;
  const targetHand = state.hands[target];
  if (action.cardIndex < 0 || action.cardIndex >= targetHand.length) return null;

  const hands = state.hands.map(h => [...h]);
  const drawn = hands[target][action.cardIndex];
  hands[target] = [
    ...hands[target].slice(0, action.cardIndex),
    ...hands[target].slice(action.cardIndex + 1),
  ];
  hands[playerId] = removePairs([...hands[playerId], drawn]);

  const nextState: OldMaidState = {
    hands,
    currentPlayer: playerId,
    activePlayers: [...state.activePlayers],
    order: [...state.order],
    done: false,
  };

  // この着手で手札が空になったプレイヤー(引いた本人 or 引かれた相手)をすべて上がりとして除外
  const removeSet = new Set<number>();
  const curIdxOrig = state.activePlayers.indexOf(playerId);
  for (const pid of [...nextState.activePlayers]) {
    if (nextState.hands[pid].length === 0) {
      removeSet.add(pid);
    }
  }
  if (removeSet.size > 0) {
    for (const pid of removeSet) {
      const idx = nextState.activePlayers.indexOf(pid);
      if (idx >= 0) {
        nextState.activePlayers.splice(idx, 1);
        nextState.order.push(pid);
      }
    }
  }

  // 残り1人以下なら終了(残った1人がババ持ち = 敗者)
  if (nextState.activePlayers.length <= 1) {
    if (nextState.activePlayers.length === 1 && !nextState.order.includes(nextState.activePlayers[0])) {
      nextState.order.push(nextState.activePlayers[0]);
    }
    nextState.done = true;
    nextState.currentPlayer = nextState.activePlayers[0] ?? -1;
    return nextState;
  }

  // 次のターン: 元の順番で playerId の次に手札の残っているプレイヤー
  for (let step = 1; step <= state.activePlayers.length; step++) {
    const candidate = state.activePlayers[(curIdxOrig + step) % state.activePlayers.length];
    if (nextState.activePlayers.includes(candidate)) {
      nextState.currentPlayer = candidate;
      break;
    }
  }
  return nextState;
}

export function isFinished(state: OldMaidState): boolean {
  return state.done;
}

export function results(state: OldMaidState): { playerId: number; rank: number; isLoser: boolean }[] {
  // order = 上がり順(先頭=最上位)。最後が敗者(ババ持ち)
  const n = state.order.length;
  return state.order.map((pid, i) => ({
    playerId: pid,
    rank: i + 1,
    isLoser: i === n - 1 && n > 1,
  }));
}

/** CPU: 相手の手札から1枚選ぶ(ランダム。戦略なし) */
export function cpuPick(state: OldMaidState, _playerId: number): OldMaidAction {
  const target = targetOf(state);
  const targetHand = state.hands[target ?? -1] ?? [];
  if (targetHand.length === 0) return { cardIndex: 0 };
  return { cardIndex: Math.floor(Math.random() * targetHand.length) };
}

export const oldMaidDef: TurnGameDef<OldMaidState, OldMaidAction> = {
  id: 'old-maid',
  setup,
  currentPlayer: current,
  legalActions,
  apply,
  isFinished,
  results,
  chooseCpuAction: cpuPick,
};
