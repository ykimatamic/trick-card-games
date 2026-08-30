import { describe, it, expect } from 'vitest';
import {
  setup,
  apply,
  isPlayable,
  playableCards,
  legalActions,
  current,
  isFinished,
  results,
  cpuPick,
  sevensDef,
  type SevensState,
} from './sevens';
import type { MpCard } from './cards';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function card(suit: MpCard['suit'], rank: MpCard['rank']): MpCard {
  return { id: `${suit}-${rank}`, suit, rank, faceUp: true };
}

describe('isPlayable (layout rule)', () => {
  const played = new Map<string, MpCard>();
  played.set('spades:7', card('spades', '7'));

  it('7 opens a suit', () => {
    expect(isPlayable(card('hearts', '7'), new Map())).toBe(true);
  });

  it('plays adjacent above the 7', () => {
    expect(isPlayable(card('spades', '8'), played)).toBe(true);
  });

  it('plays adjacent below the 7', () => {
    expect(isPlayable(card('spades', '6'), played)).toBe(true);
  });

  it('rejects cards not adjacent to exposed card', () => {
    expect(isPlayable(card('spades', '9'), played)).toBe(false);
    expect(isPlayable(card('spades', '5'), played)).toBe(false);
    expect(isPlayable(card('hearts', '8'), played)).toBe(false);
  });

  it('allows another card once its neighbor is placed', () => {
    played.set('spades:8', card('spades', '8'));
    expect(isPlayable(card('spades', '9'), played)).toBe(true);
    played.set('spades:6', card('spades', '6'));
    expect(isPlayable(card('spades', '5'), played)).toBe(true);
  });
});

describe('setup', () => {
  it('deals all 52 cards without any loss', () => {
    const s = setup(4, mulberry32(5));
    const total = s.hands.reduce((a, h) => a + h.length, 0);
    expect(total).toBe(52);
    expect(s.played.size).toBe(0);
  });

  it('starter holds spades 7', () => {
    const s = setup(3, mulberry32(8));
    const starter = s.currentPlayer;
    expect(s.hands[starter].some(c => c.suit === 'spades' && c.rank === '7')).toBe(true);
  });
});

describe('turn flow', () => {
  it('starter has a legal move (spades 7)', () => {
    const s = setup(3, mulberry32(11));
    const acts = legalActions(s, s.currentPlayer);
    expect(acts.some(a => a.kind === 'play')).toBe(true);
  });

  it('pass is only legal when there is no playable card', () => {
    const s = setup(3, mulberry32(13));
    const cur = s.currentPlayer;
    // 初期状態(♠7あり)では必ず出せるのでパスは使えない
    const acts = legalActions(s, cur);
    expect(playsCount(acts)).toBeGreaterThan(0);
    expect(acts.some(a => a.kind === 'pass')).toBe(false);
    // 出せるカードが無い状況ではパスのみが許可される
    const stuckState: SevensState = {
      ...s,
      hands: [[card('hearts', '2')], [card('spades', '6')], [card('hearts', '3')]],
      played: new Map([['spades:6', card('spades', '6')], ['spades:4', card('spades', '4')]]),
      currentPlayer: 0,
    };
    const stuckActs = legalActions(stuckState, 0);
    expect(playsCount(stuckActs)).toBe(0);
    expect(stuckActs.some(a => a.kind === 'pass')).toBe(true);
  });

  function playsCount(a: { kind: 'play' | 'pass' }[]): number {
    return a.filter(x => x.kind === 'play').length;
  }

  it('playing a card advances the turn', () => {
    const s = setup(3, mulberry32(17));
    const cur = s.currentPlayer;
    const plays = playableCards(s, cur);
    const next = apply(s, cur, { kind: 'play', handIndex: plays[0] })!;
    expect(next.played.size).toBe(1);
    expect(next.currentPlayer).not.toBe(cur);
  });
});

describe('full game simulation', () => {
  it('forever-pass deadlock is detected and ends the game', () => {
    // 誰も出せない(全員が隣接カードを持たない)詰み状態を作る
    const base = setup(2, mulberry32(5));
    const s: SevensState = {
      ...base,
      hands: [[card('hearts', '2')], [card('hearts', '4')]],
      played: new Map<string, MpCard>([['spades:7', card('spades', '7')]]),
      currentPlayer: 0,
      hasCards: [true, true],
    };
    // 1周(2人)の連続パスで詰み判定になる
    let cur = s.currentPlayer;
    let state = s;
    let guard = 0;
    while (!isFinished(state) && guard++ < 10) {
      const a = legalActions(state, cur)[0];
      expect(a.kind).toBe('pass');
      state = apply(state, cur, a)!;
      cur = current(state) as number;
    }
    expect(isFinished(state)).toBe(true);
    // 手札が少ないプレイヤーが上位になる
    expect(results(state)![0].playerId).toBe(0);
  });

  it('always terminates with complete ranking for 2-7 players', () => {
    for (let players = 2; players <= 7; players++) {
      for (let seed = 0; seed < 60; seed++) {
        let s = setup(players, mulberry32(seed + players * 1000));
        let guard = 0;
        while (!isFinished(s)) {
          expect(guard).toBeLessThan(300);
          guard++;
          const cur = current(s)!;
          const a = cpuPick(s, cur);
          const next = apply(s, cur, a);
          expect(next).not.toBeNull();
          s = next!;
        }
        const res = results(s)!;
        expect(res.length).toBe(players);
        const rankSet = new Set(res.map(r => r.rank));
        expect(rankSet.size).toBe(players);
        // 7並べは勝者(1位)がいるが敗者フラグは末位のみ
        expect(res.filter(r => r.isLoser).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('conserves all 52 cards (played + hands)', () => {
    let s = setup(4, mulberry32(1));
    while (!isFinished(s)) {
      const cur = current(s)!;
      s = apply(s, cur, cpuPick(s, cur))!;
    }
    const inHands = s.hands.reduce((a, h) => a + h.length, 0);
    // ゲームは「残り1人」で終了するため、そのプレイヤーの手札は場に出ない
    expect(s.played.size + inHands).toBe(52);
  });

  it('sevensDef identity', () => {
    expect(sevensDef.id).toBe('sevens');
  });
});
