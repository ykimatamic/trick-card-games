import { describe, expect, it } from 'vitest';
import {
  setup,
  apply,
  legalActions,
  current,
  isFinished,
  results,
  handValue,
  isSoft,
  isBlackjack,
  dealerPick,
  settle,
  blackjackDef,
} from './blackjack';
import type { BlackjackState, BlackjackAction } from './blackjack';
import type { MpCard } from './cards';
import type { Rank } from '../types';
import type { TurnGameDef } from './contract';

function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function mkCard(rank: Rank): MpCard {
  return { id: rank, suit: 'spades', rank, faceUp: true };
}

describe('blackjack points', () => {
  it('A counts as 11 when it does not bust', () => {
    expect(handValue([mkCard('A'), mkCard('9')])).toBe(20);
  });

  it('A counts as 1 when 11 would bust', () => {
    expect(handValue([mkCard('A'), mkCard('9'), mkCard('A')])).toBe(21);
    expect(handValue([mkCard('A'), mkCard('K'), mkCard('5')])).toBe(16);
  });

  it('face cards are 10', () => {
    expect(handValue([mkCard('K'), mkCard('Q'), mkCard('J')])).toBe(30);
  });

  it('detects soft hand', () => {
    expect(isSoft([mkCard('A'), mkCard('6')])).toBe(true); // soft 17
    expect(isSoft([mkCard('A'), mkCard('9')])).toBe(true); // soft 20 (A=11)
    expect(isSoft([mkCard('9'), mkCard('10')])).toBe(false); // no ace -> hard
  });

  it('detects blackjack (2 cards totaling 21)', () => {
    expect(isBlackjack([mkCard('A'), mkCard('K')])).toBe(true);
    expect(isBlackjack([mkCard('A'), mkCard('10')])).toBe(true);
    expect(isBlackjack([mkCard('10'), mkCard('K')])).toBe(false); // 20
    expect(isBlackjack([mkCard('A'), mkCard('A'), mkCard('9')])).toBe(false); // 3 cards
  });
});

describe('blackjack flow', () => {
  it('starts in bet phase for the human player', () => {
    const s = setup(2, makeRng(1));
    expect(s.phase).toBe('bet');
    expect(current(s)).toBe(0);
    expect(s.bank).toBe(1000);
    // bet actions available
    expect(legalActions(s, 0).length).toBeGreaterThan(0);
  });

  it('bet deals two cards to player and dealer, hides dealer hole card', () => {
    let s = setup(2, makeRng(3));
    const bet = legalActions(s, 0)[0] as { type: 'bet'; amount: number };
    s = apply(s, 0, bet)!;
    expect(s.player).toHaveLength(2);
    expect(s.dealer).toHaveLength(2);
    expect(s.dealer[1].faceUp).toBe(false);
    expect(s.phase).toBe('turn');
    expect(current(s)).toBe(0);
  });

  it('hit draws a card for the player', () => {
    let s = setup(2, makeRng(5));
    s = apply(s, 0, legalActions(s, 0)[0] as { type: 'bet'; amount: number })!;
    const before = s.player.length;
    if (s.phase === 'turn') {
      s = apply(s, 0, { type: 'hit' })!;
      expect(s.phase === 'turn' || s.done).toBe(true);
      if (!s.done) expect(s.player.length).toBe(before + 1);
    }
  });

  it('double doubles the bet, draws one card, then dealer plays to settlement', () => {
    let s = setup(2, makeRng(9));
    const bet = legalActions(s, 0)[0] as { type: 'bet'; amount: number };
    s = apply(s, 0, bet)!;
    if (legalActions(s, 0).some(a => a.type === 'double')) {
      const betBefore = s.bet;
      const before = s.player.length;
      s = apply(s, 0, { type: 'double' })!;
      // 1枚引いてスタンド扱い → ディーラーフェーズへ(即確定しない)
      expect(s.player).toHaveLength(before + 1);
      expect(s.bet).toBe(betBefore * 2);
      expect(s.phase).toBe('dealer');
      // ディーラーが引いて終了まで進む
      let guard = 0;
      while (current(s) === 1 && guard++ < 30) {
        s = apply(s, 1, dealerPick(s))!;
      }
      expect(isFinished(s)).toBe(true);
      expect(s.outcome).not.toBeNull();
    }
  });

  it('dealer plays to stand via chooseCpuAction', () => {
    let s = setup(2, makeRng(11));
    const bet = legalActions(s, 0)[0] as { type: 'bet'; amount: number };
    s = apply(s, 0, bet)!;
    // player stands to hand to dealer
    if (!isBlackjack(s.player) && s.phase === 'turn') {
      s = apply(s, 0, { type: 'stand' })!;
    }
    // dealer auto-plays until done
    let guard = 0;
    while (current(s) === 1 && guard++ < 30) {
      const action = dealerPick(s);
      s = apply(s, 1, action)!;
    }
    expect(isFinished(s)).toBe(true);
    expect(s.outcome).not.toBeNull();
  });
});

describe('blackjack outcome & bank', () => {
  it('bank never goes below zero and matches outcome', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = setup(2, makeRng(seed));
      const startBank = s.bank;
      const bet = legalActions(s, 0)[0] as { type: 'bet'; amount: number };
      s = apply(s, 0, bet)!;
      const betAmt = s.bet;
      // human: stand on 17+ else hit
      let guard = 0;
      while (!isFinished(s) && current(s) === 0 && guard++ < 30) {
        if (handValue(s.player) >= 17) {
          s = apply(s, 0, { type: 'stand' })!;
        } else {
          s = apply(s, 0, { type: 'hit' })!;
        }
      }
      while (!isFinished(s) && current(s) === 1 && guard++ < 60) {
        s = apply(s, 1, dealerPick(s))!;
      }
      expect(isFinished(s)).toBe(true);
      expect(s.bank).toBeGreaterThanOrEqual(0);
      // bank は掛金を引き出さない総額。net をそのまま加算する
      let expected;
      if (s.outcome === 'win') expected = startBank + betAmt;
      else if (s.outcome === 'blackjack') expected = startBank + Math.round(betAmt * 1.5);
      else if (s.outcome === 'push') expected = startBank;
      else expected = startBank - betAmt;
      expect(s.bank).toBe(expected);
      const res = results(s)!;
      expect(res).toHaveLength(2);
      if (s.outcome === 'lose') expect(res[0].isLoser).toBe(true);
      else expect(res[0].isLoser).toBe(false);
    }
  });

  it('supports a custom starting bank via context', () => {
    const s = setup(2, makeRng(1), { startBank: 200 });
    expect(s.bank).toBe(200);
  });

  it('bank reaches 0 when a loss consumes the whole bank (game over)', () => {
    const s: BlackjackState = {
      deck: [],
      player: [mkCard('10'), mkCard('7')],
      dealer: [mkCard('10'), mkCard('K')],
      bet: 100,
      bank: 100,
      phase: 'turn',
      currentPlayer: 0,
      outcome: null,
      net: 0,
      done: false,
    };
    const after = settle(s);
    expect(after.done).toBe(true);
    expect(after.outcome).toBe('lose');
    expect(after.bank).toBe(0);
  });

  it('push outcome marks neither player as a loser', () => {
    const s: BlackjackState = {
      deck: [],
      player: [mkCard('A'), mkCard('K')],
      dealer: [mkCard('A'), mkCard('Q')],
      bet: 100,
      bank: 1000,
      phase: 'turn',
      currentPlayer: 0,
      outcome: null,
      net: 0,
      done: false,
    };
    const after = settle(s);
    expect(after.outcome).toBe('push');
    expect(after.net).toBe(0);
    expect(after.bank).toBe(1000);
    const res = results(after)!;
    expect(res).toHaveLength(2);
    expect(res[0].isLoser).toBe(false);
    expect(res[1].isLoser).toBe(false);
  });
});

describe('blackjack def shape', () => {
  it('exposes a valid TurnGameDef', () => {
    const def: TurnGameDef<BlackjackState, BlackjackAction> = blackjackDef;
    expect(def.id).toBe('blackjack');
    expect(typeof def.setup).toBe('function');
    expect(typeof def.apply).toBe('function');
    expect(typeof def.chooseCpuAction).toBe('function');
  });
});
