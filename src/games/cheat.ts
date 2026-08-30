import { createPlayingDeck, shuffleCards, type MpCard } from './cards';
import type { TurnGameDef } from './contract';
import { RANKS, type Rank } from '../types';

/**
 * ダウト(Cheat / Doubt)
 *
 * - 手札を伏せて、宣言したランク(A→2→3… と順に進む)のカードとして場に出していく
 * - 出したカードは実は嘘でもよい(伏せているので宣言と中身は別)
 * - 次のプレイヤーは「ダウト」を宣言して、直前に出されたカードの中身を検証できる
 * - 検証: 最後の出札が全て宣言どおりなら検証側(ダウト宣言者)が、嘘なら出した側が
 *   場のカード全部を手札として回収する(ペナルティ)。その後は場が流れ次の人は A から
 * - 手札を出し切った順に上位。残り1人になったら終了(その人が最下位)
 */
export interface CheatGroup {
  playerId: number;
  declaredRank: Rank;
  cards: MpCard[];
}

export interface CheatStats {
  /** これまでに検証で表になった回数 */
  revealed: number;
  /** うち「ウソ」だった回数 */
  lies: number;
}

export interface CheatState {
  hands: MpCard[][];
  /** 場に出された山(カードの出札のグループ) */
  center: CheatGroup[];
  /** 最後に宣言されたランク(ダウトで場が流れても次の宣言ランクはこれの次から続く) */
  lastDeclared: Rank | null;
  currentPlayer: number;
  /** まだ手札のあるプレイヤー */
  activePlayers: number[];
  /** 上がり順(先頭=最上位) */
  order: number[];
  /** 検証履歴(CPUのウソ傾向推定用) */
  stats: Record<number, CheatStats>;
  done: boolean;
}

export type CheatAction =
  | { type: 'play'; handIndexes: number[] }
  | { type: 'doubt' };

/** 場の最後の出札が宣言するランク(現在宣言すべきランク) */
export function nextRank(state: CheatState): Rank {
  if (state.lastDeclared === null) return RANKS[0];
  return RANKS[(RANKS.indexOf(state.lastDeclared) + 1) % RANKS.length];
}

/** 最後の出札が嘘かどうか(全て宣言どおりなら false) */
export function isGroupHonest(group: CheatGroup): boolean {
  return group.cards.every(c => c.rank === group.declaredRank);
}

export function setup(playerCount: number, rng: () => number = Math.random): CheatState {
  const deck = shuffleCards(createPlayingDeck(0), rng);
  const hands: MpCard[][] = Array.from({ length: playerCount }, () => []);
  deck.forEach((c, i) => hands[i % playerCount].push({ ...c, faceUp: false }));
  const stats: Record<number, CheatStats> = {};
  for (let p = 0; p < playerCount; p++) stats[p] = { revealed: 0, lies: 0 };

  // 全員手札が空でないことを保証(52枚 ÷ N人)
  const activePlayers = hands
    .map((h, p) => (h.length > 0 ? p : -1))
    .filter(p => p >= 0);

  return {
    hands,
    center: [],
    lastDeclared: null,
    currentPlayer: activePlayers[0] ?? 0,
    activePlayers,
    order: [],
    stats,
    done: activePlayers.length <= 1,
  };
}

export function current(state: CheatState): number | null {
  return state.done ? null : state.currentPlayer;
}

function nextActive(state: CheatState, from: number): number {
  const n = state.hands.length;
  for (let step = 1; step <= n; step++) {
    const p = (from + step) % n;
    if (state.activePlayers.includes(p)) return p;
  }
  return -1;
}

/** ダウトを宣言できるか(場に前のプレイヤーの出札がある) */
export function canDoubt(state: CheatState, playerId: number): boolean {
  const last = state.center[state.center.length - 1];
  return !!last && last.playerId !== playerId;
}

export function legalActions(state: CheatState, playerId: number): CheatAction[] {
  if (state.done || playerId !== state.currentPlayer) return [];
  const hand = state.hands[playerId];
  const acts: CheatAction[] = [];
  for (let i = 0; i < hand.length; i++) {
    acts.push({ type: 'play', handIndexes: [i] });
  }
  if (canDoubt(state, playerId)) {
    acts.push({ type: 'doubt' });
  }
  return acts;
}

function validateIndexes(hand: MpCard[], handIndexes: number[]): boolean {
  if (handIndexes.length < 1 || handIndexes.length > 4) return false;
  const seen = new Set<number>();
  for (const i of handIndexes) {
    if (!Number.isInteger(i) || i < 0 || i >= hand.length || seen.has(i)) return false;
    seen.add(i);
  }
  return true;
}

export function apply(state: CheatState, playerId: number, action: CheatAction): CheatState | null {
  if (state.done || playerId !== state.currentPlayer) return null;

  const next: CheatState = {
    hands: state.hands.map(h => [...h]),
    center: state.center.map(g => ({ ...g, cards: [...g.cards] })),
    lastDeclared: state.lastDeclared,
    currentPlayer: playerId,
    activePlayers: [...state.activePlayers],
    order: [...state.order],
    stats: Object.fromEntries(
      Object.entries(state.stats).map(([k, v]) => [k, { ...v }])
    ),
    done: false,
  };

  if (action.type === 'play') {
    const hand = state.hands[playerId];
    if (hand.length === 0) return null;
    if (!validateIndexes(hand, action.handIndexes)) return null;
    const declaredRank = nextRank(state);
    const cards = action.handIndexes.map(i => ({ ...hand[i], faceUp: false }));
    // 手札から取り除く
    const remove = new Set(action.handIndexes);
    next.hands[playerId] = hand.filter((_, i) => !remove.has(i));
    next.center.push({ playerId, declaredRank, cards });
    // ダウトで場が流れても次の宣言ランクが「直前の次」から続くように記憶
    next.lastDeclared = declaredRank;

    // 出し切り判定
    if (next.hands[playerId].length === 0) {
      const idx = next.activePlayers.indexOf(playerId);
      if (idx >= 0) next.activePlayers.splice(idx, 1);
      next.order.push(playerId);
    }

    if (next.activePlayers.length <= 1) {
      next.done = true;
      if (next.activePlayers.length === 1) {
        next.order.push(next.activePlayers[0]);
      }
      next.currentPlayer = -1;
      return next;
    }

    next.currentPlayer = nextActive(next, playerId);
    return next;
  }

  if (action.type === 'doubt') {
    if (!canDoubt(state, playerId)) return null;
    const last = state.center[state.center.length - 1];
    const honest = isGroupHonest(last);

    // 検証履歴を更新
    const s = next.stats[last.playerId];
    s.revealed += 1;
    if (!honest) s.lies += 1;

    // ペナルティ: 場の全カードを敗者へ
    const allCards = state.center.flatMap(g => g.cards);
    const collector = honest ? playerId : last.playerId;
    next.hands[collector] = [...next.hands[collector], ...allCards];
    next.center = [];

    // ダウトの結果で手札が増えても、既に上がった(=activePlayersから外れた)プレイヤーは対象外
    if (next.activePlayers.length <= 1) {
      next.done = true;
      if (next.activePlayers.length === 1) next.order.push(next.activePlayers[0]);
      next.currentPlayer = -1;
      return next;
    }

    next.currentPlayer = nextActive(next, collector);
    return next;
  }

  return null;
}

export function isFinished(state: CheatState): boolean {
  return state.done;
}

export function results(state: CheatState): { playerId: number; rank: number; isLoser: boolean }[] {
  const n = state.order.length;
  return state.order.map((pid, i) => ({
    playerId: pid,
    rank: i + 1,
    isLoser: i === n - 1 && n > 1,
  }));
}

/** プレイヤーの「嘘をつく確率」の推定(検証履歴が無ければ 0.5) */
export function liarProbability(state: CheatState, playerId: number): number {
  const s = state.stats[playerId];
  if (!s || s.revealed === 0) return 0.5;
  return s.lies / s.revealed;
}

/** CPU: 宣言どおりのカードを出せるなら出す。無ければダウトを検討、ダメなら嘘を1枚 */
export function cpuPick(state: CheatState, playerId: number): CheatAction {
  const hand = state.hands[playerId];
  const declaredRank = nextRank(state);

  // 場に前の人の出札があるとき、自分の手に宣言ランクが無く相手が嘘をつきそうならダウト
  if (canDoubt(state, playerId)) {
    const lastGroup = state.center[state.center.length - 1];
    const prob = liarProbability(state, lastGroup.playerId);
    const hasDeclared = hand.some(c => c.rank === declaredRank);
    if (!hasDeclared && prob >= 0.4 && Math.random() < prob) {
      return { type: 'doubt' };
    }
  }

  // 宣言ランクのカードを最大4枚まで出す(正直プレイ)
  const matching = hand
    .map((c, i) => ({ i, rank: c.rank }))
    .filter(x => x.rank === declaredRank)
    .map(x => x.i);
  if (matching.length > 0) {
    return { type: 'play', handIndexes: matching.slice(0, 4) };
  }

  // 嘘: 手持ちから1枚選んで出す
  const idx = Math.floor(Math.random() * hand.length);
  return { type: 'play', handIndexes: [idx] };
}

export const cheatDef: TurnGameDef<CheatState, CheatAction> = {
  id: 'cheat',
  setup,
  currentPlayer: current,
  legalActions,
  apply,
  isFinished,
  results,
  chooseCpuAction: cpuPick,
};
