import { describe, expect, it } from 'vitest';
import { setup, apply, legalActions, current, isFinished, results, faceDownPositions, cpuPick, memoryDef } from './memory';
import type { MemoryState, MemoryAction } from './memory';
import type { TurnGameDef } from './contract';

/** 固定シードの擬似RNG(再現可能) */
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function findIndex(state: MemoryState, rank: string): number[] {
  return state.cards
    .map((c, i) => (c && c.rank === rank ? i : -1))
    .filter(i => i >= 0);
}

describe('memory setup', () => {
  it('52 cards (no joker) placed face down by default', () => {
    const s = setup(2, makeRng(1));
    expect(s.cards).toHaveLength(52);
    expect(s.cards.every(c => c !== null && !c.faceUp)).toBe(true);
    expect(s.currentPlayer).toBe(0);
    expect(isFinished(s)).toBe(false);
  });

  it('supports jokerCount via context', () => {
    const s = setup(2, makeRng(1), { jokerCount: 1 });
    expect(s.cards).toHaveLength(53);
    expect(s.cards.filter(c => c && c.rank === 'JOKER')).toHaveLength(1);
  });
});

describe('memory flipping', () => {
  it('flipping a card face-down position is legal, flipped one is not', () => {
    const s = setup(2, makeRng(7));
    const acts = legalActions(s, 0);
    expect(acts.length).toBe(52);
    const first = acts[0];
    if (first.type !== 'flip') throw new Error('expected a flip action');
    const idx = first.flipIndex;
    const after = apply(s, 0, { type: 'flip', flipIndex: idx })!;
    expect(after.flipped).toEqual([idx]);
    expect(after.pending).toBe(false);
    // 同じ位置をもう一度めくるのは不正
    expect(apply(after, 0, { type: 'flip', flipIndex: idx })).toBeNull();
  });

  it('only current player may flip', () => {
    const s = setup(2, makeRng(3));
    expect(apply(s, 1, { type: 'flip', flipIndex: 0 })).toBeNull();
  });

  it('2枚めくり後は pending となり、カードはまだ伏せ戻されない', () => {
    const s = setup(2, makeRng(11));
    const a = findIndex(s, 'A');
    const s1 = apply(s, 0, { type: 'flip', flipIndex: a[0] })!;
    const s2 = apply(s1, 0, { type: 'flip', flipIndex: a[1] })!;
    expect(s2.pending).toBe(true);
    expect(s2.cards[a[0]]).not.toBeNull();
    expect(s2.cards[a[1]]).not.toBeNull();
    // pending 中はもうめくれない
    expect(apply(s2, 0, { type: 'flip', flipIndex: a[0] })).toBeNull();
  });

  it('matching rank: resolve でペアを獲得して同ターン継続', () => {
    const s = setup(2, makeRng(11));
    const a = findIndex(s, 'A');
    const s1 = apply(s, 0, { type: 'flip', flipIndex: a[0] })!;
    const s2 = apply(s1, 0, { type: 'flip', flipIndex: a[1] })!;
    const s3 = apply(s2, 0, { type: 'resolve' })!;
    expect(s3.cards[a[0]]).toBeNull();
    expect(s3.cards[a[1]]).toBeNull();
    expect(s3.collected[0]).toContain(s.cards[a[0]]!.id);
    expect(s3.flipped).toEqual([]);
    expect(s3.pending).toBe(false);
    // 同ターン継続
    expect(s3.currentPlayer).toBe(0);
  });

  it('mismatching rank: resolve で伏せ戻して次のプレイヤーへ', () => {
    const s = setup(2, makeRng(13));
    const a = findIndex(s, 'A')[0];
    let b = -1;
    for (let i = 0; i < s.cards.length; i++) {
      if (s.cards[i] && s.cards[i]!.rank !== 'A') {
        b = i;
        break;
      }
    }
    const s1 = apply(s, 0, { type: 'flip', flipIndex: a })!;
    const s2 = apply(s1, 0, { type: 'flip', flipIndex: b })!;
    expect(s2.pending).toBe(true);
    const s3 = apply(s2, 0, { type: 'resolve' })!;
    expect(s3.cards[a]!.faceUp).toBe(false);
    expect(s3.cards[b]!.faceUp).toBe(false);
    expect(s3.cards[a]).not.toBeNull();
    expect(s3.flipped).toEqual([]);
    expect(s3.pending).toBe(false);
    expect(s3.currentPlayer).toBe(1);
  });
});

describe('memory completion and ranking', () => {
  /** 全ペアを確実に回収してゲームを終了させるヘルパー */
  function playToCompletion(state: MemoryState, counts: number[]): MemoryState {
    let s = state;
    let turn = 0;
    let guard = 0;
    while (!isFinished(s) && guard++ < 5000) {
      const acts = legalActions(s, turn);
      if (acts.length === 0) {
        turn = (turn + 1) % counts.length;
        continue;
      }
      if (acts[0].type === 'resolve') {
        s = apply(s, turn, { type: 'resolve' })!;
        turn = s.currentPlayer;
        continue;
      }
      // 1枚めくる
      s = apply(s, turn, { type: 'flip', flipIndex: acts[0].flipIndex })!;
      if (!s.pending && s.flipped.length === 1) {
        // 2枚目: 同じランクの伏せ位置を探す
        const openRank = s.cards[s.flipped[0]]!.rank;
        const pair = faceDownPositions(s).filter(i => s.cards[i]!.rank === openRank);
        if (pair.length === 0) {
          // ペアが残っていない(めくり先が1枚しか残っていない)ので手番を進める
          turn = (turn + 1) % counts.length;
          s = { ...s, flipped: [], pending: false, currentPlayer: turn };
          continue;
        }
        s = apply(s, turn, { type: 'flip', flipIndex: pair[0] })!;
      }
      if (s.pending) {
        s = apply(s, turn, { type: 'resolve' })!;
      }
      turn = s.currentPlayer;
    }
    return s;
  }

  it('collecting every pair finishes the game and ranks by collected count', () => {
    // 2人で、プレイヤー0が14枚・1が12枚を取ってプレイヤー0が勝利するように回す
    const s = setup(2, makeRng(5));
    const state = playToCompletion(s, [2, 2]);
    expect(isFinished(state)).toBe(true);
    const res = results(state)!;
    expect(res).toHaveLength(2);
    const counts = state.collected.map(a => a.length);
    expect(counts[0] + counts[1]).toBe(52);
    // 順位は獲得枚数降順
    expect(counts[res[0].playerId]).toBeGreaterThanOrEqual(counts[res[1].playerId]);
    // 勝者の獲得枚数は敗者以上
    expect(state.collected[res[0].playerId].length).toBeGreaterThanOrEqual(
      state.collected[res[1].playerId].length
    );
    // 0が全て勝つ場合も考慮: 順位1位=獲得枚数最大
    const max = Math.max(...counts);
    expect(counts[res[0].playerId]).toBe(max);
  });

  it('ends when all cards are collected; ranks sorted by collected count (3 players)', () => {
    const s = setup(3, makeRng(23));
    const state = playToCompletion(s, [3, 3, 3]);
    expect(isFinished(state)).toBe(true);
    const res = results(state)!;
    expect(res).toHaveLength(3);
    const counts = state.collected.map(a => a.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(52);
    for (let i = 0; i < res.length - 1; i++) {
      expect(counts[res[i].playerId]).toBeGreaterThanOrEqual(counts[res[i + 1].playerId]);
    }
  });

  it('ties get the same competition rank (1,2,2,4)', () => {
    const s: MemoryState = {
      cards: [],
      memory: {},
      collected: [['a', 'b', 'c', 'd'], ['e', 'f'], ['g', 'h'], []],
      currentPlayer: -1,
      flipped: [],
      pending: false,
      done: true,
      order: [0, 1, 2, 3],
    };
    const res = results(s)!;
    expect(res[0]).toMatchObject({ playerId: 0, rank: 1, isLoser: false });
    expect(res[1]).toMatchObject({ playerId: 1, rank: 2, isLoser: false });
    expect(res[2]).toMatchObject({ playerId: 2, rank: 2, isLoser: false });
    expect(res[3]).toMatchObject({ playerId: 3, rank: 4, isLoser: false });
  });
});

describe('memory CPU simulation', () => {
  it('runs full games to completion across many seeds', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = setup(4, makeRng(seed));
      let state = s;
      let guard = 0;
      while (!isFinished(state) && guard++ < 4000) {
        const cp = current(state)!;
        const action = cpuPick(state, cp);
        const next = apply(state, cp, action);
        expect(next).not.toBeNull();
        state = next!;
      }
      expect(isFinished(state)).toBe(true);
      const res = results(state)!;
      expect(res).toHaveLength(4);
      // 獲得枚数の総和 = 52
      const total = state.collected.reduce((acc, a) => acc + a.length, 0);
      expect(total).toBe(52);
      // 順位は獲得枚数降順
      const counts = state.collected.map(a => a.length);
      for (let i = 0; i < res.length - 1; i++) {
        expect(counts[res[i].playerId]).toBeGreaterThanOrEqual(counts[res[i + 1].playerId]);
      }
    }
  });
});

describe('memory def shape', () => {
  it('exposes a valid TurnGameDef', () => {
    const def: TurnGameDef<MemoryState, MemoryAction> = memoryDef;
    expect(def.id).toBe('memory');
    expect(typeof def.setup).toBe('function');
    expect(typeof def.apply).toBe('function');
  });
});
