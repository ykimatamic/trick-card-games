import { createPlayingDeck, shuffleCards, type MpCard } from './cards';
import type { TurnGameDef } from './contract';

/**
 * ブラックジャック(Blackjack)
 *
 * 自分とディーラーの点数の取り合い(21に近い方が勝ち)。
 * - 絵札=10、A=1/11(有利な方で計算)、バスト(22以上)は負け
 * - 配布直後の2枚で21 = ナチュラルBJ(1.5倍払い)
 * - ディーラーは 17以上でスタンド(ソフト17はヒット)
 * - アクション: ヒット / スタンド / 初回のみダブル(ベット2倍で1枚引いて即スタンド)
 */
export interface BlackjackState {
  deck: MpCard[];
  player: MpCard[];
  dealer: MpCard[];
  bet: number;
  bank: number;
  phase: 'bet' | 'turn' | 'dealer' | 'done';
  currentPlayer: number;
  outcome: 'win' | 'lose' | 'push' | 'blackjack' | null;
  net: number;
  done: boolean;
}

export type BlackjackAction =
  | { type: 'bet'; amount: number }
  | { type: 'hit' }
  | { type: 'stand' }
  | { type: 'double' };

export interface BlackjackSetupContext {
  /** 開始時のチップ残高 */
  startBank?: number;
}

export const BET_CHIPS = [10, 25, 50, 100, 250, 500];

function cardPoints(c: MpCard): number {
  if (c.rank === 'A') return 1;
  if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') return 10;
  return Number(c.rank);
}

/** 手札の最適合計(Aを11としてカウント可能) */
export function handValue(hand: MpCard[]): number {
  let sum = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') {
      sum += 1;
      aces++;
    } else {
      sum += cardPoints(c);
    }
  }
  while (aces > 0 && sum + 10 <= 21) {
    sum += 10;
    aces--;
  }
  return sum;
}

/** ソフト(Aを11で数えていて 21 を超えない)かどうか */
export function isSoft(hand: MpCard[]): boolean {
  let sum = 0;
  let hasAce = false;
  for (const c of hand) {
    if (c.rank === 'A') {
      sum += 1;
      hasAce = true;
    } else {
      sum += cardPoints(c);
    }
  }
  return hasAce && sum + 10 <= 21;
}

/** ナチュラルブラックジャック(2枚で21) */
export function isBlackjack(hand: MpCard[]): boolean {
  return hand.length === 2 && handValue(hand) === 21;
}

function draw(deck: MpCard[]): [MpCard | null, MpCard[]] {
  if (deck.length === 0) return [null, deck];
  const c = deck[deck.length - 1];
  return [c, deck.slice(0, deck.length - 1)];
}

export function setup(
  _playerCount: number,
  rng: () => number = Math.random,
  context?: BlackjackSetupContext
): BlackjackState {
  const deck = shuffleCards(createPlayingDeck(0), rng);
  return {
    deck,
    player: [],
    dealer: [],
    bet: 0,
    bank: context?.startBank ?? 1000,
    phase: 'bet',
    currentPlayer: 0,
    outcome: null,
    net: 0,
    done: false,
  };
}

export function current(state: BlackjackState): number | null {
  if (state.done) return null;
  if (state.phase === 'bet' || state.phase === 'turn') return 0;
  if (state.phase === 'dealer') return 1;
  return null;
}

export function legalActions(state: BlackjackState, playerId: number): BlackjackAction[] {
  if (state.done) return [];
  if (state.phase === 'bet' && playerId === 0) {
    return BET_CHIPS.filter(a => a <= state.bank).map(amount => ({ type: 'bet' as const, amount }));
  }
  if (state.phase === 'turn' && playerId === 0) {
    const acts: BlackjackAction[] = [{ type: 'hit' }, { type: 'stand' }];
    if (state.player.length === 2 && state.bank >= state.bet * 2) {
      acts.push({ type: 'double' });
    }
    return acts;
  }
  if (state.phase === 'dealer' && playerId === 1) {
    return [{ type: 'hit' }, { type: 'stand' }];
  }
  return [];
}

/** 勝敗を確定して bank / outcome / net を更新する */
export function settle(state: BlackjackState): BlackjackState {
  const p = handValue(state.player);
  const d = handValue(state.dealer);
  const playerBust = p > 21;
  const dealerBust = d > 21;
  let outcome: BlackjackState['outcome'];
  if (playerBust) {
    outcome = 'lose';
  } else if (isBlackjack(state.player)) {
    outcome = isBlackjack(state.dealer) ? 'push' : 'blackjack';
  } else if (dealerBust) {
    outcome = 'win';
  } else if (p > d) {
    outcome = 'win';
  } else if (p < d) {
    outcome = 'lose';
  } else {
    outcome = 'push';
  }
  const mult = outcome === 'blackjack' ? 1.5 : outcome === 'win' ? 1 : outcome === 'push' ? 0 : -1;
  const net = Math.round(state.bet * mult);
  return {
    ...state,
    outcome,
    net,
    bank: state.bank + net,
    phase: 'done',
    currentPlayer: -1,
    done: true,
  };
}

/** ディーラーフェーズ突入時に裏向きのホールカードを表にし、ナチュラル確認を兼ねる */
function revealDealer(state: BlackjackState): BlackjackState {
  return {
    ...state,
    dealer: state.dealer.map(c => ({ ...c, faceUp: true })),
  };
}

export function apply(state: BlackjackState, playerId: number, action: BlackjackAction): BlackjackState | null {
  if (state.done) return null;
  if (playerId !== current(state)) return null;

  if (state.phase === 'bet') {
    if (action.type !== 'bet') return null;
    const { amount } = action;
    if (amount <= 0 || amount > state.bank) return null;
    let deck = state.deck;
    const c0 = draw(deck);
    if (!c0[0]) return null;
    deck = c0[1];
    const c1 = draw(deck);
    if (!c1[0]) return null;
    deck = c1[1];
    const c2 = draw(deck);
    if (!c2[0]) return null;
    deck = c2[1];
    const c3 = draw(deck);
    if (!c3[0]) return null;
    deck = c3[1];
    const player = [c0[0], c1[0]].map(c => ({ ...c, faceUp: true }));
    const dealer = [{ ...c2[0], faceUp: true }, { ...c3[0], faceUp: false }];
    const next: BlackjackState = {
      ...state,
      deck,
      player,
      dealer,
      bet: amount,
      phase: 'turn',
      currentPlayer: 0,
    };
    // 配布直後にプレイヤーがナチュラルBJなら即座に確定
    if (isBlackjack(player)) {
      return settle(revealDealer(next));
    }
    return next;
  }

  if (state.phase === 'turn') {
    if (action.type === 'hit') {
      const [c, deck] = draw(state.deck);
      if (!c) return null;
      const player = [...state.player, { ...c, faceUp: true }];
      const next: BlackjackState = {
        ...state,
        deck,
        player,
        phase: 'turn',
        currentPlayer: 0,
      };
      if (handValue(player) > 21) {
        // バスト → 即負け
        return settle(revealDealer(next));
      }
      return next;
    }
    if (action.type === 'stand') {
      // ディーラーフェーズへ移行し、ディーラーがカードを引けるようにする
      return revealDealer({ ...state, phase: 'dealer', currentPlayer: 1 });
    }
    if (action.type === 'double') {
      if (state.player.length !== 2) return null;
      if (state.bet * 2 > state.bank) return null;
      const [c, deck] = draw(state.deck);
      if (!c) return null;
      const player = [...state.player, { ...c, faceUp: true }];
      // 1枚引いてスタンド扱い → ディーラーフェーズへ(ディーラーが引く)
      const next: BlackjackState = {
        ...state,
        deck,
        player,
        bet: state.bet * 2,
        phase: 'dealer',
        currentPlayer: 1,
      };
      return revealDealer(next);
    }
    return null;
  }

  if (state.phase === 'dealer') {
    if (action.type === 'hit') {
      const [c, deck] = draw(state.deck);
      if (!c) return null;
      const dealer = [...state.dealer.map(x => ({ ...x, faceUp: true })), { ...c, faceUp: true }];
      const next: BlackjackState = {
        ...state,
        deck,
        dealer,
        phase: 'dealer',
        currentPlayer: 1,
      };
      if (handValue(dealer) > 21) {
        return settle(next);
      }
      return next;
    }
    if (action.type === 'stand') {
      return settle(state);
    }
    return null;
  }

  return null;
}

export function isFinished(state: BlackjackState): boolean {
  return state.done;
}

export function results(state: BlackjackState): { playerId: number; rank: number; isLoser: boolean }[] {
  if (state.outcome === 'push') {
    // プッシュ(引き分け)は誰も負けていない
    return [
      { playerId: 0, rank: 1, isLoser: false },
      { playerId: 1, rank: 1, isLoser: false },
    ];
  }
  const playerLoss = state.outcome === 'lose';
  return [
    { playerId: 0, rank: playerLoss ? 2 : 1, isLoser: playerLoss },
    { playerId: 1, rank: playerLoss ? 1 : 2, isLoser: !playerLoss },
  ];
}

/** ディーラー: 17以上でスタンド(ソフト17はヒット) */
export function dealerPick(state: BlackjackState): BlackjackAction {
  const total = handValue(state.dealer);
  if (total > 21) return { type: 'stand' };
  if (total < 17) return { type: 'hit' };
  if (total === 17 && isSoft(state.dealer)) return { type: 'hit' };
  return { type: 'stand' };
}

export const blackjackDef: TurnGameDef<BlackjackState, BlackjackAction> = {
  id: 'blackjack',
  setup,
  currentPlayer: current,
  legalActions,
  apply,
  isFinished,
  results,
  chooseCpuAction: dealerPick,
};
