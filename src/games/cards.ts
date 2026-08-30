import {
  SUITS,
  RANKS,
  RANK_VALUES,
  SUIT_COLORS,
  SUIT_SYMBOLS,
  type Suit,
  type Rank,
} from '../types';

/**
 * 対戦型カードゲーム用のカード表現。
 * ソリティアの Card と異なり、ジョーカーを表現できる。
 */
export interface MpCard {
  id: string;
  suit: Suit;
  rank: Rank | 'JOKER';
  faceUp: boolean;
}

export function isJoker(c: MpCard): boolean {
  return c.rank === 'JOKER';
}

/** ジョーカー(両面/色付き) */
export function createJoker(color: Suit = 'spades'): MpCard {
  return { id: `joker-${color}`, suit: color, rank: 'JOKER', faceUp: true };
}

/**
 * 通常52枚 + ジョーカー(jokerCount 枚)のデッキを生成する。
 */
export function createPlayingDeck(jokerCount = 1): MpCard[] {
  const deck: MpCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank, faceUp: true });
    }
  }
  for (let i = 0; i < jokerCount; i++) {
    deck.push(createJoker(i % 2 === 0 ? 'spades' : 'hearts'));
  }
  return deck;
}

export function shuffleCards(deck: MpCard[], rng: () => number = Math.random): MpCard[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** ジョーカーを除くランク数値(1=JOKER の扱いは呼び出し側で) */
export function rankValue(c: MpCard): number {
  return c.rank === 'JOKER' ? 0 : RANK_VALUES[c.rank];
}

/** 表示色(ジョーカーは彩度の高い色) */
export function colorOf(c: MpCard): string {
  if (c.rank === 'JOKER') return '#b8860b';
  return SUIT_COLORS[c.suit];
}

export function symbolOf(c: MpCard): string {
  if (c.rank === 'JOKER') return '🃏';
  return SUIT_SYMBOLS[c.suit];
}

export function cardLabel(c: MpCard): string {
  if (c.rank === 'JOKER') return 'ジョーカー';
  const suitJp = { hearts: 'ハート', diamonds: 'ダイヤ', clubs: 'クラブ', spades: 'スペード' }[c.suit];
  return `${suitJp}の${c.rank}`;
}
