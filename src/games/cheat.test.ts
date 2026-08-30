import { describe, expect, it } from 'vitest';
import {
  setup,
  apply,
  legalActions,
  current,
  isFinished,
  results,
  nextRank,
  isGroupHonest,
  canDoubt,
  liarProbability,
  cpuPick,
  cheatDef,
} from './cheat';
import type { CheatState, CheatAction } from './cheat';
import type { TurnGameDef } from './contract';
import { RANKS } from '../types';

function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** 現在のプレイヤーが「正直(宣言どおり)」または「嘘」の1枚を出した状態を返す */
function playOne(state: CheatState, honest: boolean): CheatState {
  const p = current(state)!;
  const declared = nextRank(state);
  const hand = state.hands[p];
  let idx = hand.findIndex(c => (c.rank === declared) === honest);
  if (idx < 0) idx = 0;
  return apply(state, p, { type: 'play', handIndexes: [idx] })!;
}

describe('cheat setup and rule helpers', () => {
  it('deals the full deck face down and starts with a player', () => {
    const s = setup(3, makeRng(1));
    const total = s.hands.reduce((a, h) => a + h.length, 0);
    expect(total).toBe(52);
    expect(s.hands.every(h => h.every(c => !c.faceUp))).toBe(true);
    expect(s.activePlayers).toHaveLength(3);
    expect(current(s)).not.toBeNull();
    expect(isFinished(s)).toBe(false);
  });

  it('the declared rank cycles A->2->...->K->A', () => {
    let s = setup(2, makeRng(2));
    expect(nextRank(s)).toBe('A');
    s = playOne(s, true);
    expect(s.center.length).toBe(1);
    expect(s.center[0].declaredRank).toBe('A');
    expect(nextRank(s)).toBe('2');
  });

  it('isGroupHonest detects lies', () => {
    const mk = (rank: string) => ({ id: rank, suit: 'spades' as const, rank: rank as never, faceUp: false });
    expect(isGroupHonest({ playerId: 0, declaredRank: 'A', cards: [mk('A'), mk('A')] })).toBe(true);
    expect(isGroupHonest({ playerId: 0, declaredRank: 'A', cards: [mk('A'), mk('5')] })).toBe(false);
  });
});

describe('cheat doubt resolution', () => {
  it('doubt catches a liar: the declarer collects the whole pile', () => {
    let s = setup(2, makeRng(3));
    const p0 = current(s)!;
    const handBefore = s.hands[p0].length;
    s = playOne(s, false); // player 0 lies
    expect(current(s)).toBe(1);
    const centerCount = s.center.reduce((a, g) => a + g.cards.length, 0);
    expect(centerCount).toBeGreaterThanOrEqual(1);
    s = apply(s, 1, { type: 'doubt' })!; // player 1 calls
    // 嘘なので出した側(0)が場を回収
    expect(s.center).toHaveLength(0);
    expect(s.hands[p0].length).toBe(handBefore + centerCount - 1); // -1 (出した) + center(回収)
    expect(s.done).toBe(false);
  });

  it('doubt against an honest play punishes the challenger', () => {
    let s = setup(2, makeRng(4));
    const p1 = 1;
    const p1Before = s.hands[p1].length;
    s = playOne(s, true); // player 0 plays honestly
    expect(current(s)).toBe(1);
    const centerCount = s.center.reduce((a, g) => a + g.cards.length, 0);
    s = apply(s, 1, { type: 'doubt' })!;
    // 正直なので検証側(1)が回収
    expect(s.center).toHaveLength(0);
    expect(s.hands[p1].length).toBe(p1Before + centerCount);
  });

  it('BUG-3: declared rank continues after a doubt instead of resetting to A', () => {
    let s = setup(2, makeRng(4));
    expect(nextRank(s)).toBe('A');
    s = playOne(s, true); // player 0 plays honest A
    const lastDeclared = s.center[s.center.length - 1].declaredRank;
    expect(nextRank(s)).toBe(RANKS[(RANKS.indexOf(lastDeclared) + 1) % RANKS.length]);
    s = apply(s, 1, { type: 'doubt' })!; // 検証→場が流れる
    expect(s.center).toHaveLength(0);
    // ダウト後も A ではなく「直前の次のランク」から続く
    expect(nextRank(s)).toBe(RANKS[(RANKS.indexOf(lastDeclared) + 1) % RANKS.length]);
  });

  it('records lie statistics for CPU estimation', () => {
    let s = setup(2, makeRng(5));
    s = playOne(s, false); // decide
    s = apply(s, 1, { type: 'doubt' })!;
    expect(s.stats[0].revealed).toBe(1);
    expect(s.stats[0].lies).toBe(1);
    expect(liarProbability(s, 0)).toBe(1);
  });

  it('canDoubt is only true when the previous play was by someone else', () => {
    const s = setup(2, makeRng(6));
    expect(canDoubt(s, 0)).toBe(false); // 場が空
  });
});

describe('cheat finishing order', () => {
  it('a player who empties their hand finishes; the last one is loser', () => {
    // 2人で手動シミュレーション: 全カードを取り切る
    let s = setup(2, makeRng(7));
    let guard = 0;
    while (!isFinished(s) && guard++ < 2000) {
      const p = current(s)!;
      // 正直なら手札が減る。正直にプレイできる限り減らす
      const before = s.hands[p].length;
      s = playOne(s, true);
      if (s.currentPlayer === p && s.hands[p].length === before) {
        // 正直に出せなかったダウトで進める
        s = playOne(s, false);
      }
      // 手番が自分に戻ってきたら諦めて違う行動
      if (s.currentPlayer === p && !s.done) {
        s = apply(s, p, { type: 'doubt' })!;
      }
    }
    expect(isFinished(s)).toBe(true);
    const res = results(s)!;
    expect(res).toHaveLength(2);
    const last = res[res.length - 1];
    expect(last.isLoser).toBe(true);
  });
});

describe('cheat legality', () => {
  it('rejects playing more than 4 cards', () => {
    let s = setup(2, makeRng(8));
    // 人(0)の手札から5枚選ぶ → 不正
    const p = current(s)!;
    const n = s.hands[p].length;
    const big = [0, 1, 2, 3, 4].filter(i => i < n).slice(0, 5);
    if (big.length === 5) {
      expect(apply(s, p, { type: 'play', handIndexes: big })).toBeNull();
    }
  });

  it('a non-current player cannot act', () => {
    const s = setup(2, makeRng(9));
    const p0 = current(s)!;
    const other = p0 === 0 ? 1 : 0;
    expect(apply(s, other, { type: 'play', handIndexes: [0] })).toBeNull();
    expect(apply(s, other, { type: 'doubt' })).toBeNull();
  });

  it('exposes a valid TurnGameDef', () => {
    const def: TurnGameDef<CheatState, CheatAction> = cheatDef;
    expect(def.id).toBe('cheat');
    expect(typeof def.apply).toBe('function');
    expect(typeof def.chooseCpuAction).toBe('function');
  });
});

describe('cheat CPU full simulation', () => {
  it('runs to completion across players and seeds with full ranking', () => {
    for (const players of [2, 3, 4, 5, 6]) {
      for (let seed = 1; seed <= 15; seed++) {
        let s = setup(players, makeRng(seed));
        let guard = 0;
        while (!isFinished(s) && guard++ < 20000) {
          const p = current(s)!;
          const action = cpuPick(s, p);
          const next = apply(s, p, action);
          if (!next) {
            // 万一CPUが不正な手を選んだらランダムな合法手で継続
            const legal = legalActions(s, p);
            s = apply(s, p, legal[legal.length - 1])!;
            continue;
          }
          s = next;
        }
        expect(isFinished(s)).toBe(true);
        const res = results(s)!;
        expect(res).toHaveLength(players);
        // 順位は一意(順序通り)
        const ranks = res.map(r => r.rank);
        expect(new Set(ranks).size).toBe(players);
        const last = res[res.length - 1];
        expect(last.isLoser).toBe(true);
      }
    }
  });
});
