import { describe, it, expect } from 'vitest';
import {
  createDeck,
  shuffleDeck,
  mulberry32,
  dealCards,
  moveCards,
  flipFromStock,
  checkWin,
  autoMoveSafeToFoundation,
  isSafeFoundationSend,
} from './game';
import type { GameState, GameRules, Card } from './types';
import { DEFAULT_RULES } from './types';

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

const deck = createDeck();
const c = (id: string): Card => ({ ...deck.find(x => x.id === id)!, faceUp: true });

describe('createDeck / shuffleDeck / mulberry32', () => {
  it('52枚のユニークなデッキを作る', () => {
    const d = createDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d.map(x => x.id)).size).toBe(52);
    expect(d.every(x => !x.faceUp)).toBe(true);
  });

  it('mulberry32は同一シードで同一系列を返す', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA.every(v => v >= 0 && v < 1)).toBe(true);
  });

  it('異なるシードは異なるシャッフルになる', () => {
    const s1 = shuffleDeck(createDeck(), mulberry32(1)).map(x => x.id).join();
    const s2 = shuffleDeck(createDeck(), mulberry32(2)).map(x => x.id).join();
    expect(s1).not.toBe(s2);
  });
});

describe('dealCards', () => {
  it('場面構造が正しい', () => {
    const s = dealCards(createDeck(), mulberry32(7));
    const total =
      s.stock.length +
      s.waste.length +
      s.foundations.flat().length +
      s.tableau.flat().length;
    expect(total).toBe(52);
    expect(s.tableau.map(p => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    s.tableau.forEach(pile => {
      expect(pile[pile.length - 1].faceUp).toBe(true);
      if (pile.length > 1) {
        expect(pile[0].faceUp).toBe(false);
        expect(pile.slice(0, -1).every(x => !x.faceUp)).toBe(true);
      }
    });
    expect(s.recycles).toBe(0);
    expect(s.score).toBe(0);
  });

  it('同一シードで同一配布、ルールも保持する', () => {
    const rules: GameRules = { drawCount: 3, maxRecycles: 3, scoring: 'vegas' };
    const key = (s: GameState) => s.tableau.map(p => p.map(c2 => c2.id).join()).join('|');
    const a = dealCards(createDeck(), mulberry32(99), rules);
    const b = dealCards(createDeck(), mulberry32(99), rules);
    expect(key(a)).toBe(key(b));
    expect(a.rules).toEqual(rules);
  });
});

describe('moveCards スコア(標準)', () => {
  it('waste→場 +5', () => {
    const s = mkState({ waste: [c('spades-7')], tableau: [[c('hearts-8')]] });
    const r = moveCards(s, 'waste', 0, 'tableau', 0, 1)!;
    expect(r.score).toBe(5);
  });

  it('場→基礎 +10、めくり +5', () => {
    const down = { ...deck.find(x => x.id === 'spades-A')!, faceUp: false };
    const s = mkState({ tableau: [[down, c('hearts-A')]] });
    const r = moveCards(s, 'tableau', 0, 'foundation', 1, 1)!;
    expect(r.score).toBe(15);
    expect(r.tableau[0][0].faceUp).toBe(true);
  });

  it('基礎→場 -15、場→場 ±0', () => {
    let s = mkState({ foundations: [[c('hearts-Q')]], tableau: [[c('spades-K')]] });
    expect(moveCards(s, 'foundation', 0, 'tableau', 0, 1)!.score).toBe(-15);

    s = mkState({ tableau: [[c('hearts-9')], [c('spades-10')]] });
    expect(moveCards(s, 'tableau', 0, 'tableau', 1, 1)!.score).toBe(0);
  });

  it('不正な移動はnull', () => {
    const s = mkState({ waste: [c('spades-7')], tableau: [[c('spades-8')]] });
    expect(moveCards(s, 'waste', 0, 'tableau', 0, 1)).toBeNull();
  });
});

describe('moveCards スコア(Vegas)', () => {
  const vegas: GameRules = { drawCount: 1, maxRecycles: -1, scoring: 'vegas' };

  it('基礎送りのみ+5、他は加算しない', () => {
    const down = { ...deck.find(x => x.id === 'spades-A')!, faceUp: false };
    let s = mkState({ rules: vegas, tableau: [[down, c('hearts-A')]] });
    expect(moveCards(s, 'tableau', 0, 'foundation', 1, 1)!.score).toBe(5);

    s = mkState({ rules: vegas, waste: [c('spades-7')], tableau: [[c('hearts-8')]] });
    expect(moveCards(s, 'waste', 0, 'tableau', 0, 1)!.score).toBe(0);

    s = mkState({ rules: vegas, foundations: [[] as Card[], [c('hearts-Q')]], tableau: [[c('spades-K')]] });
    expect(moveCards(s, 'foundation', 1, 'tableau', 0, 1)!.score).toBe(0);
  });
});

describe('flipFromStock', () => {
  it('draw-3は3枚まとめてめくる', () => {
    const rules: GameRules = { drawCount: 3, maxRecycles: -1, scoring: 'standard' };
    const stock = [c('spades-K'), c('hearts-Q'), c('diamonds-J'), c('clubs-10'), c('spades-9')];
    const s = mkState({ rules, stock });
    const r = flipFromStock(s);
    expect(r.waste).toHaveLength(3);
    expect(r.waste[r.waste.length - 1].id).toBe('diamonds-J');
    expect(r.stock).toHaveLength(2);
    expect(r.moves).toBe(1);
  });

  it('残り枚数がdrawCount未満なら残り全てめくる', () => {
    const rules: GameRules = { drawCount: 3, maxRecycles: -1, scoring: 'standard' };
    const s = mkState({ rules, stock: [c('spades-K'), c('hearts-Q')] });
    const r = flipFromStock(s);
    expect(r.waste).toHaveLength(2);
    expect(r.stock).toHaveLength(0);
  });

  it('リサイクル回数制限を超えると状態不変', () => {
    const rules: GameRules = { drawCount: 1, maxRecycles: 1, scoring: 'standard' };
    let s = mkState({ rules, waste: [c('spades-K'), c('hearts-Q')] });
    s = flipFromStock(s);
    expect(s.recycles).toBe(1);
    expect(s.stock).toHaveLength(2);

    // ストックを空にして2周目のリサイクルを試みる → 制限で不変
    const drained = mkState({
      rules,
      stock: [],
      waste: s.stock.map(x => ({ ...x, faceUp: true })),
      recycles: s.recycles,
      moves: s.moves,
    });
    const r = flipFromStock(drained);
    expect(r).toBe(drained);
  });
});

describe('安全な基礎送り', () => {
  it('Aと2は常に安全', () => {
    expect(isSafeFoundationSend(c('hearts-A'), [[], [], [], []], ['spades', 'hearts', 'diamonds', 'clubs'])).toBe(true);
  });

  it('両反対色が十分進んでいなければ3は安全でない', () => {
    const fs = [[c('spades-A')], [], [], []];
    expect(isSafeFoundationSend(c('hearts-3'), fs, ['spades', 'hearts', 'diamonds', 'clubs'])).toBe(false);
  });

  it('autoMoveSafeToFoundationは連続適用され勝利判定には至らない', () => {
    const s = mkState({ tableau: [[c('spades-A')], [c('spades-2')]] });
    const after = autoMoveSafeToFoundation(s);
    expect(after.foundations[0]).toHaveLength(2);
    expect(checkWin(after)).toBe(false);
  });
});

describe('checkWin', () => {
  it('4基礎が13枚ずつで勝利', () => {
    const full = (suit: string) =>
      Array.from({ length: 13 }, (_, i) => c(`${suit}-${['A','2','3','4','5','6','7','8','9','10','J','Q','K'][i]}`));
    const s = mkState({ foundations: [full('spades'), full('hearts'), full('diamonds'), full('clubs')] });
    expect(checkWin(s)).toBe(true);
  });
});
