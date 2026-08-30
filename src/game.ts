import type { Card, Suit, GameState, GameRules } from './types';
import { SUITS, RANKS, RANK_VALUES, DEFAULT_RULES } from './types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Move {
  sourceType: 'tableau' | 'waste' | 'foundation';
  sourceIndex: number;
  targetType: 'tableau' | 'foundation';
  targetIndex: number;
  cardCount: number;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        faceUp: false,
        id: `${suit}-${rank}`,
      });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[], rng: () => number = Math.random): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const FOUNDATION_SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export function dealCards(deck: Card[], rng?: () => number, rules: GameRules = DEFAULT_RULES): GameState {
  const shuffled = shuffleDeck(deck, rng);
  const tableau: Card[][] = [[], [], [], [], [], [], []];

  let cardIndex = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = col; row < 7; row++) {
      const card = { ...shuffled[cardIndex], faceUp: row === col };
      tableau[row].push(card);
      cardIndex++;
    }
  }

  const stock = shuffled.slice(cardIndex).map(card => ({ ...card, faceUp: false }));

  return {
    stock,
    waste: [],
    foundations: [[], [], [], []],
    foundationSuits: [...FOUNDATION_SUITS],
    tableau,
    moves: 0,
    time: 0,
    score: 0,
    recycles: 0,
    rules: { ...rules },
    gameOver: false,
    won: false,
  };
}

export function getCardColor(suit: Suit): 'red' | 'black' {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

export function canPlaceOnTableau(card: Card, targetPile: Card[]): boolean {
  if (targetPile.length === 0) {
    return card.rank === 'K';
  }

  const topCard = targetPile[targetPile.length - 1];
  if (!topCard.faceUp) return false;

  const cardColor = getCardColor(card.suit);
  const topColor = getCardColor(topCard.suit);

  return cardColor !== topColor && RANK_VALUES[card.rank] === RANK_VALUES[topCard.rank] - 1;
}

export function canPlaceOnFoundation(card: Card, foundation: Card[], expectedSuit: Suit): boolean {
  if (foundation.length === 0) {
    return card.rank === 'A' && card.suit === expectedSuit;
  }

  const topCard = foundation[foundation.length - 1];
  return card.suit === topCard.suit && RANK_VALUES[card.rank] === RANK_VALUES[topCard.rank] + 1;
}

/**
 * ゲーム状態のディープクローン(配列部分のみ)。
 * Card オブジェクト自体は不変(スプレッドコピーで新参照)のため
 * シャローコピーで問題なし。undo 履歴への参照保存にも影響しない。
 */
function cloneState(state: GameState): GameState {
  return {
    ...state,
    stock: [...state.stock],
    waste: [...state.waste],
    foundations: state.foundations.map(f => [...f]),
    foundationSuits: [...state.foundationSuits],
    tableau: state.tableau.map(t => [...t]),
  };
}

export function moveCards(
  state: GameState,
  sourceType: 'tableau' | 'waste' | 'foundation',
  sourceIndex: number,
  targetType: 'tableau' | 'foundation',
  targetIndex: number,
  cardCount: number = 1
): GameState | null {
  if (sourceType === 'waste' && cardCount !== 1) return null;
  if (sourceType === 'foundation' && cardCount !== 1) return null;

  const newState = cloneState(state);
  let movingCards: Card[];

  if (sourceType === 'waste') {
    if (newState.waste.length === 0) return null;
    movingCards = [newState.waste[newState.waste.length - 1]];
    newState.waste = newState.waste.slice(0, -1);
  } else if (sourceType === 'foundation') {
    if (sourceIndex < 0 || sourceIndex >= newState.foundations.length) return null;
    const foundation = newState.foundations[sourceIndex];
    if (foundation.length === 0) return null;
    movingCards = [foundation[foundation.length - 1]];
    newState.foundations[sourceIndex] = foundation.slice(0, -1);
  } else {
    if (sourceIndex < 0 || sourceIndex >= newState.tableau.length) return null;
    const pile = newState.tableau[sourceIndex];
    if (pile.length < cardCount || cardCount < 1) return null;
    const tail = pile.slice(pile.length - cardCount);
    if (tail.some(c => !c.faceUp)) return null;
    movingCards = tail;
    newState.tableau[sourceIndex] = pile.slice(0, pile.length - cardCount);
  }

  const head = movingCards[0];

  if (targetType === 'foundation') {
    if (targetIndex < 0 || targetIndex >= newState.foundations.length) return null;
    if (movingCards.length !== 1) return null;
    const foundation = newState.foundations[targetIndex];
    if (!canPlaceOnFoundation(head, foundation, newState.foundationSuits[targetIndex])) return null;
    newState.foundations[targetIndex] = [...foundation, { ...head, faceUp: true }];
  } else {
    if (targetIndex < 0 || targetIndex >= newState.tableau.length) return null;
    const pile = newState.tableau[targetIndex];
    if (!canPlaceOnTableau(head, pile)) return null;
    newState.tableau[targetIndex] = [
      ...pile,
      ...movingCards.map(c => ({ ...c, faceUp: true })),
    ];
  }

  let scoreDelta = 0;
  const vegas = state.rules.scoring === 'vegas';
  if (targetType === 'foundation') {
    scoreDelta += vegas ? 5 : 10;
  } else if (!vegas) {
    if (sourceType === 'waste') {
      scoreDelta += 5;
    } else if (sourceType === 'foundation') {
      scoreDelta -= 15;
    }
  }

  if (sourceType === 'tableau') {
    const sourcePile = newState.tableau[sourceIndex];
    if (sourcePile.length > 0 && !sourcePile[sourcePile.length - 1].faceUp) {
      const last = sourcePile[sourcePile.length - 1];
      newState.tableau[sourceIndex] = [
        ...sourcePile.slice(0, -1),
        { ...last, faceUp: true },
      ];
      if (!vegas) scoreDelta += 5;
    }
  }

  newState.score = state.score + scoreDelta;
  newState.moves += 1;
  newState.won = checkWin(newState);
  return newState;
}

export function flipFromStock(state: GameState): GameState {
  if (state.stock.length === 0 && state.waste.length === 0) {
    return state;
  }

  const newState = cloneState(state);

  if (newState.stock.length === 0) {
    if (state.rules.maxRecycles >= 0 && newState.recycles >= state.rules.maxRecycles) {
      return state;
    }
    newState.stock = newState.waste.slice().reverse().map(c => ({ ...c, faceUp: false }));
    newState.waste = [];
    newState.recycles += 1;
  } else {
    const drawCount = Math.min(state.rules.drawCount, newState.stock.length);
    for (let i = 0; i < drawCount; i++) {
      const card = newState.stock[newState.stock.length - 1];
      newState.stock = newState.stock.slice(0, -1);
      newState.waste = [...newState.waste, { ...card, faceUp: true }];
    }
  }

  newState.moves += 1;
  return newState;
}

export function checkWin(state: GameState): boolean {
  return state.foundations.every(f => f.length === 13);
}

export function findLegalMoves(state: GameState): Move[] {
  const moves: Move[] = [];

  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    if (!top.faceUp) continue;
    for (let f = 0; f < state.foundations.length; f++) {
      if (canPlaceOnFoundation(top, state.foundations[f], state.foundationSuits[f])) {
        moves.push({ sourceType: 'tableau', sourceIndex: i, targetType: 'foundation', targetIndex: f, cardCount: 1 });
      }
    }
  }

  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    for (let f = 0; f < state.foundations.length; f++) {
      if (canPlaceOnFoundation(top, state.foundations[f], state.foundationSuits[f])) {
        moves.push({ sourceType: 'waste', sourceIndex: 0, targetType: 'foundation', targetIndex: f, cardCount: 1 });
      }
    }
    for (let t = 0; t < state.tableau.length; t++) {
      if (canPlaceOnTableau(top, state.tableau[t])) {
        moves.push({ sourceType: 'waste', sourceIndex: 0, targetType: 'tableau', targetIndex: t, cardCount: 1 });
      }
    }
  }

  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i];
    let runLength = 0;
    while (runLength < pile.length && pile[pile.length - 1 - runLength].faceUp) {
      runLength++;
    }
    for (let k = 1; k <= runLength; k++) {
      const head = pile[pile.length - k];
      for (let t = 0; t < state.tableau.length; t++) {
        if (t === i) continue;
        if (canPlaceOnTableau(head, state.tableau[t])) {
          moves.push({ sourceType: 'tableau', sourceIndex: i, targetType: 'tableau', targetIndex: t, cardCount: k });
        }
      }
    }
  }

  for (let f = 0; f < state.foundations.length; f++) {
    const foundation = state.foundations[f];
    if (foundation.length === 0) continue;
    const top = foundation[foundation.length - 1];
    for (let t = 0; t < state.tableau.length; t++) {
      if (canPlaceOnTableau(top, state.tableau[t])) {
        moves.push({ sourceType: 'foundation', sourceIndex: f, targetType: 'tableau', targetIndex: t, cardCount: 1 });
      }
    }
  }

  return moves;
}

function tryNextFoundationMove(state: GameState): GameState | null {
  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    if (!top.faceUp) continue;
    for (let f = 0; f < state.foundations.length; f++) {
      if (canPlaceOnFoundation(top, state.foundations[f], state.foundationSuits[f])) {
        return moveCards(state, 'tableau', i, 'foundation', f, 1);
      }
    }
  }

  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    for (let f = 0; f < state.foundations.length; f++) {
      if (canPlaceOnFoundation(top, state.foundations[f], state.foundationSuits[f])) {
        return moveCards(state, 'waste', 0, 'foundation', f, 1);
      }
    }
  }

  return null;
}

export function autoMoveToFoundation(state: GameState): GameState {
  let current = state;
  for (;;) {
    const next = tryNextFoundationMove(current);
    if (!next) return current;
    current = next;
  }
}

export function isSafeFoundationSend(
  card: Card,
  foundations: Card[][],
  foundationSuits: Suit[]
): boolean {
  if (RANK_VALUES[card.rank] <= 2) return true;
  const cardColor = getCardColor(card.suit);
  for (let f = 0; f < foundations.length; f++) {
    if (getCardColor(foundationSuits[f]) === cardColor) continue;
    if (foundations[f].length < RANK_VALUES[card.rank] - 1) return false;
  }
  return true;
}

function nextSafeFoundationState(state: GameState): GameState | null {
  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    if (!top.faceUp) continue;
    if (!isSafeFoundationSend(top, state.foundations, state.foundationSuits)) continue;
    for (let f = 0; f < state.foundations.length; f++) {
      if (canPlaceOnFoundation(top, state.foundations[f], state.foundationSuits[f])) {
        return moveCards(state, 'tableau', i, 'foundation', f, 1);
      }
    }
  }

  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    if (isSafeFoundationSend(top, state.foundations, state.foundationSuits)) {
      for (let f = 0; f < state.foundations.length; f++) {
        if (canPlaceOnFoundation(top, state.foundations[f], state.foundationSuits[f])) {
          return moveCards(state, 'waste', 0, 'foundation', f, 1);
        }
      }
    }
  }

  return null;
}

export function autoMoveSafeToFoundation(state: GameState): GameState {
  let current = state;
  for (;;) {
    const next = nextSafeFoundationState(current);
    if (!next) return current;
    current = next;
  }
}
