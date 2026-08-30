export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
  id: string;
}

export interface GameRules {
  drawCount: 1 | 3;
  maxRecycles: number;
  scoring: 'standard' | 'vegas';
}

export const DEFAULT_RULES: GameRules = {
  drawCount: 1,
  maxRecycles: -1,
  scoring: 'standard',
};

export interface GameState {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  foundationSuits: Suit[];
  tableau: Card[][];
  moves: number;
  time: number;
  score: number;
  recycles: number;
  rules: GameRules;
  gameOver: boolean;
  won: boolean;
}

export interface MoveEntry {
  t: 'm' | 's' | 'u';
  src?: 'tableau' | 'waste' | 'foundation';
  si?: number;
  dst?: 'tableau' | 'foundation';
  di?: number;
  n?: number;
}

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const RANK_VALUES: Record<Rank, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const SUIT_COLORS: Record<Suit, string> = {
  hearts: '#e74c3c',
  diamonds: '#e74c3c',
  clubs: '#2c3e50',
  spades: '#2c3e50',
};
