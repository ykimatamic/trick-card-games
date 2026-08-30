import { createPlayingDeck, shuffleCards, type MpCard } from './cards';
import type { TurnGameDef } from './contract';

/**
 * 神経衰弱(Concentration / Memory)
 *
 * 場のカードを伏せて並べ、手番で2枚ずつめくる。
 * 同じランクなら獲得して自分の山へ(手番継続)、違えば伏せ戻して次の人へ。
 * 全てのカードが獲得されたら終了。獲得枚数がそのまま順位になる。
 */
export interface MemoryState {
  /** 場のカード。null は獲得済み(取り除いた) */
  cards: (MpCard | null)[];
  /** プレイヤー別の記憶(rank -> 位置)。全員が見たカードを記録する */
  memory: Record<number, Record<string, number[]>>;
  /** 各プレイヤーの獲得カードID */
  collected: string[][];
  /** 手番プレイヤー */
  currentPlayer: number;
  /** 調査中にめくっている位置(0〜2枚) */
  flipped: number[];
  /** 2枚めくり済みで解決待ち(この間は両カードが表向きのまま保持される) */
  pending: boolean;
  /** 終了フラグ */
  done: boolean;
  /** 順位(獲得枚数順)。先頭=最上位 */
  order: number[];
}

export type MemoryAction =
  | { type: 'flip'; flipIndex: number }
  | { type: 'resolve' };

export type MemorySetupContext = { jokerCount?: number };

/** MP 配列のラッパー(状態遷移で都度コピーする) */
function pairKey(c: MpCard): string {
  return c.rank;
}

export function setup(
  playerCount: number,
  rng: () => number = Math.random,
  context?: MemorySetupContext
): MemoryState {
  const jokerCount = context?.jokerCount ?? 0;
  const deck = shuffleCards(createPlayingDeck(jokerCount), rng);
  const cards: (MpCard | null)[] = deck.map((c, i) => ({ ...c, faceUp: false, id: `${i}-${c.id}` }));

  // 初期配布: 全員が自分以外のカードも「見られていない」状態から始める(記憶なし)
  const memory: Record<number, Record<string, number[]>> = {};
  for (let p = 0; p < playerCount; p++) memory[p] = {};

  return {
    cards,
    memory,
    collected: Array.from({ length: playerCount }, () => []),
    currentPlayer: 0,
    flipped: [],
    pending: false,
    done: playerCount <= 0 || deck.length === 0,
    order: [],
  };
}

export function current(state: MemoryState): number | null {
  return state.done ? null : state.currentPlayer;
}

/** まだ伏せてあり、現在めくられていない位置一覧 */
export function faceDownPositions(state: MemoryState): number[] {
  return state.cards.reduce<number[]>((acc, c, i) => {
    if (c && !state.flipped.includes(i)) acc.push(i);
    return acc;
  }, []);
}

export function legalActions(state: MemoryState, playerId: number): MemoryAction[] {
  if (state.done) return [];
  if (playerId !== state.currentPlayer) return [];
  if (state.pending) return [{ type: 'resolve' }];
  if (state.flipped.length >= 2) return [];
  return faceDownPositions(state).map(flipIndex => ({ type: 'flip', flipIndex }));
}

/** 手番を次のプレイヤーへ進める */
function nextPlayer(state: MemoryState): number {
  return (state.currentPlayer + 1) % state.collected.length;
}

export function apply(state: MemoryState, playerId: number, action: MemoryAction): MemoryState | null {
  if (state.done) return null;
  if (playerId !== state.currentPlayer) return null;

  if (action.type === 'flip') {
    if (state.pending) return null;
    if (state.flipped.length >= 2) return null;
    const { flipIndex } = action;
    const card = state.cards[flipIndex];
    if (!card || state.flipped.includes(flipIndex)) return null;

    const cards = [...state.cards];
    const flipped = [...state.flipped, flipIndex];

    // めくったカードを全員の記憶に記録(全員が場を見られる)
    const memory: Record<number, Record<string, number[]>> = {};
    for (const p of Object.keys(state.memory)) {
      memory[Number(p)] = {
        ...state.memory[Number(p)],
        [pairKey(card)]: [...(state.memory[Number(p)][pairKey(card)] ?? []), flipIndex],
      };
    }

    return {
      cards,
      memory,
      collected: state.collected.map(a => [...a]),
      currentPlayer: state.currentPlayer,
      flipped,
      pending: flipped.length === 2,
      done: false,
      order: [],
    };
  }

  // resolve: 2枚の判定。pending の間は両カードを表向きで保持する
  if (action.type === 'resolve') {
    if (!state.pending || state.flipped.length !== 2) return null;
    const cards = [...state.cards];
    const collected = state.collected.map(a => [...a]);
    const [i0, i1] = state.flipped;
    const c0 = cards[i0]!;
    const c1 = cards[i1]!;
    if (c0.rank === c1.rank) {
      // ペア成立 → 獲得して手番継続
      collected[playerId].push(c0.id, c1.id);
      cards[i0] = null;
      cards[i1] = null;
      if (cards.every(c => c === null)) {
        return {
          ...state,
          cards,
          collected,
          flipped: [],
          pending: false,
          done: true,
          currentPlayer: -1,
          order: buildOrder(collected),
        };
      }
      return {
        ...state,
        cards,
        collected,
        flipped: [],
        pending: false,
      };
    }
    // 不一致 → 伏せ戻して次の人へ
    cards[i0] = state.cards[i0] ? { ...c0, faceUp: false } : null;
    cards[i1] = state.cards[i1] ? { ...c1, faceUp: false } : null;
    return {
      ...state,
      cards,
      flipped: [],
      pending: false,
      currentPlayer: nextPlayer(state),
    };
  }

  return null;
}

/** 獲得枚数の多い順に順位を組み立てる */
function buildOrder(collected: string[][]): number[] {
  return collected
    .map((v, p) => ({ p, n: v.length }))
    .sort((a, b) => b.n - a.n)
    .map(x => x.p);
}

export function isFinished(state: MemoryState): boolean {
  return state.done;
}

export function results(state: MemoryState): { playerId: number; rank: number; isLoser: boolean }[] {
  // 獲得枚数で競技式順位を付ける(同数は同順位: 1,2,2,4...)。state.order は獲得数降順
  const out: { playerId: number; rank: number; isLoser: boolean }[] = [];
  for (let i = 0; i < state.order.length; i++) {
    const p = state.order[i];
    const n = state.collected[p]?.length ?? 0;
    const prevN = i > 0 ? state.collected[state.order[i - 1]]?.length ?? 0 : -1;
    const rank = i > 0 && n === prevN ? out[i - 1].rank : i + 1;
    out.push({ playerId: p, rank, isLoser: false });
  }
  return out;
}

/** CPU: 記憶マップから確定ペア→ランダムの順で1枚めくる。2枚めくり済みなら結果を確定する */
export function cpuPick(state: MemoryState, playerId: number): MemoryAction {
  if (state.pending) return { type: 'resolve' };
  const mem = state.memory[playerId] ?? {};
  const down = faceDownPositions(state);

  if (state.flipped.length === 1) {
    // 2枚目: めくり中のカードと同じランクを記憶から探す
    const open = state.cards[state.flipped[0]];
    if (open) {
      const known = (mem[open.rank] ?? []).filter(i => state.cards[i] && !state.flipped.includes(i));
      if (known.length > 0) return { type: 'flip', flipIndex: known[0] };
    }
  } else {
    // 1枚目: 記憶上で2枚以上分かっているランクの位置を優先
    for (const rank of Object.keys(mem)) {
      const known = (mem[rank] ?? []).filter(i => state.cards[i] && !state.flipped.includes(i));
      if (known.length >= 2) return { type: 'flip', flipIndex: known[0] };
    }
  }

  if (down.length === 0) {
    const remaining = state.cards.findIndex(c => c !== null);
    return { type: 'flip', flipIndex: remaining >= 0 ? remaining : 0 };
  }
  return { type: 'flip', flipIndex: down[Math.floor(Math.random() * down.length)] };
}

export const memoryDef: TurnGameDef<MemoryState, MemoryAction> = {
  id: 'memory',
  setup,
  currentPlayer: current,
  legalActions,
  apply,
  isFinished,
  results,
  chooseCpuAction: cpuPick,
};
