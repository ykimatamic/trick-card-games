import { describe, it, expect } from 'vitest';
import {
  serializeState,
  applyAction,
  isDeadlocked,
  solveSync,
  dealSolvableState,
  explainAction,
} from './engine';
import { createDeck } from './game';
import type { GameState, Card } from './types';
import { DEFAULT_RULES } from './types';

const deck = createDeck();
const c = (id: string): Card => ({ ...deck.find(x => x.id === id)!, faceUp: true });

function mkState(overrides: Partial<GameState> = {}): GameState {
  return {
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    foundationSuits: ['spades', 'hearts', 'diamonds', 'clubs'],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    time: 0,
    score: 0,
    recycles: 0,
    rules: { ...DEFAULT_RULES },
    gameOver: false,
    won: false,
    ...overrides,
  };
}

function fullSuit(suit: string): Card[] {
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  return ranks.map(r => c(`${suit}-${r}`));
}

describe('serializeState / applyAction', () => {
  it('同一盤面は同一文字列、異なる盤面は異なる文字列', () => {
    const a = mkState({ tableau: [[c('spades-K')]] });
    const b = mkState({ tableau: [[c('spades-K')]] });
    const d = mkState({ tableau: [[c('hearts-K')]] });
    expect(serializeState(a)).toBe(serializeState(b));
    expect(serializeState(a)).not.toBe(serializeState(d));
  });

  it('applyActionはmove/drawを適用する', () => {
    const s = mkState({ stock: [c('spades-K'), c('hearts-Q')] });
    const drawn = applyAction(s, { kind: 'draw' })!;
    expect(drawn.waste).toHaveLength(1);
    expect(drawn.stock).toHaveLength(1);

    const s2 = mkState({ waste: [c('spades-7')], tableau: [[c('hearts-8')]] });
    const moved = applyAction(s2, {
      kind: 'move',
      move: { sourceType: 'waste', sourceIndex: 0, targetType: 'tableau', targetIndex: 0, cardCount: 1 },
    })!;
    expect(moved.tableau[0]).toHaveLength(2);
    expect(moved.waste).toHaveLength(0);
  });
});

describe('isDeadlocked', () => {
  it('手もドローもない状態は詰み', () => {
    const down = (id: string) => ({ ...deck.find(x => x.id === id)!, faceUp: false });
    const s = mkState({ tableau: [[down('spades-K')], [down('hearts-Q')]] });
    expect(isDeadlocked(s)).toBe(true);
  });

  it('基礎へ送れる手があるなら詰みでない', () => {
    const s = mkState({ tableau: [[c('spades-A')]] });
    expect(isDeadlocked(s)).toBe(false);
  });
});

describe('solveSync', () => {
  it('一手で勝てる盤面を解く', () => {
    const foundations: Card[][] = [
      fullSuit('spades'),
      fullSuit('hearts'),
      fullSuit('diamonds'),
      fullSuit('clubs').slice(0, 12),
    ];
    const s = mkState({ waste: [c('clubs-K')], foundations });
    expect(solveSync(s, 10000).status).toBe('won');
  });

  it('完全に詰んだ盤面はunsolvableを即返す', () => {
    const down = (id: string) => ({ ...deck.find(x => x.id === id)!, faceUp: false });
    const s = mkState({ tableau: [[down('spades-K')], [down('hearts-Q')]] });
    const result = solveSync(s, 100000);
    expect(result.status).toBe('unsolvable');
    expect(result.nodes).toBeLessThan(10);
  });

  it('予算内で決着しなければbudgetを返す', () => {
    // 証明済みの通常配布は開始直後に有効手があり、1ノードでは勝利も敗北も確定しない
    const s = dealSolvableState({ difficulty: 'easy', seed: 1 }).state;
    expect(solveSync(s, 1).status).toBe('budget');
  }, 15000);
});

describe('dealSolvableState', () => {
  it('easyは証明済み配布を返す', () => {
    const dealt = dealSolvableState({ difficulty: 'easy' });
    expect(dealt.proven).toBe(true);
  });

  it('同一シードで同一配布、異なるシードで異なる配布', () => {
    const a = dealSolvableState({ difficulty: 'easy', seed: 20260822 });
    const b = dealSolvableState({ difficulty: 'easy', seed: 20260822 });
    const d = dealSolvableState({ difficulty: 'easy', seed: 20260823 });
    expect(serializeState(a.state)).toBe(serializeState(b.state));
    expect(serializeState(a.state)).not.toBe(serializeState(d.state));
  });
});

describe('explainAction', () => {
  it('移動の理由文を返す', () => {
    const s = mkState({
      waste: [c('spades-7')],
      tableau: [[c('hearts-8'), { ...deck.find(x => x.id === 'diamonds-2')!, faceUp: false }]],
    });
    const msg = explainAction(s, {
      kind: 'move',
      move: { sourceType: 'waste', sourceIndex: 0, targetType: 'tableau', targetIndex: 0, cardCount: 1 },
    });
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});
