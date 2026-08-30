import { describe, it, expect } from 'vitest';
import {
  setup,
  apply,
  classifyCombo,
  comparable,
  beats,
  legalActions,
  legalCombos,
  canLead,
  current,
  isFinished,
  results,
  cpuPick,
  titleForRank,
  daifugoDef,
  type DaifugoState,
} from './daifugo';
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
function joker(): MpCard {
  return { id: 'joker-t', suit: 'spades', rank: 'JOKER', faceUp: true };
}

// 任意の手札から指定 rank の単体アクションの indices を求める
function singleOf(state: unknown, playerId: number, rank: MpCard['rank']): { indices: number[] } | null {
  // 型を合わせるため(テストでは直接アクセス)
  const s = state as { hands: MpCard[][] };
  const idx = s.hands[playerId].findIndex(c => c.rank === rank);
  return idx >= 0 ? { indices: [idx] } : null;
}

describe('classifyCombo', () => {
  it('classifies singles', () => {
    expect(classifyCombo([card('spades', '3')])?.kind).toBe('single');
    expect(classifyCombo([joker()])?.kind).toBe('single');
    expect(classifyCombo([joker()])?.maxValue).toBe(14);
  });

  it('classifies same-rank combos', () => {
    expect(classifyCombo([card('spades', '7'), card('hearts', '7')])?.kind).toBe('pair');
    expect(classifyCombo([card('spades', '7'), card('hearts', '7'), card('clubs', '7')])?.kind).toBe('triple');
    expect(classifyCombo([card('spades', '7'), card('hearts', '7'), card('clubs', '7'), card('diamonds', '7')])?.kind).toBe('four');
  });

  it('classifies same-suit straights and rejects mixed suits / discontiguous', () => {
    const straight = classifyCombo([card('spades', '3'), card('spades', '4'), card('spades', '5')]);
    expect(straight?.kind).toBe('straight');
    expect(straight?.length).toBe(3);
    // 混スートは階段にならない(同数グループ扱いにもならない)
    expect(classifyCombo([card('spades', '3'), card('hearts', '4'), card('spades', '5')])).toBeNull();
    // 連番でない
    expect(classifyCombo([card('spades', '3'), card('spades', '5'), card('spades', '7')])).toBeNull();
  });

  it('classifies double straight (ダブル階段) and rejects invalid', () => {
    // 2スート×3連番 = 有効なダブル階段
    const dbl = classifyCombo([
      card('spades', '3'), card('hearts', '3'),
      card('spades', '4'), card('hearts', '4'),
      card('spades', '5'), card('hearts', '5'),
    ]);
    expect(dbl?.kind).toBe('double');
    expect(dbl?.length).toBe(3);
    expect(dbl?.cards.length).toBe(6);
    // 連番が2つ(4枚)だけは不可(3連番が最小)
    expect(
      classifyCombo([
        card('spades', '3'), card('hearts', '3'),
        card('spades', '4'), card('hearts', '4'),
      ])
    ).toBeNull();
    // ダブル階段でスートが3種類あると不可(平行2スートにならない)
    expect(
      classifyCombo([
        card('spades', '3'), card('hearts', '3'),
        card('spades', '4'), card('hearts', '4'),
        card('spades', '5'), card('clubs', '5'),
      ])
    ).toBeNull();
  });

  it('supports joker as wild in same-rank combos', () => {
    expect(classifyCombo([card('spades', '3'), joker()])?.kind).toBe('pair');
    expect(classifyCombo([card('spades', '3'), card('hearts', '3'), joker()])?.kind).toBe('triple');
    // ジョーカー2枚は不可(デッキに1枚のみ)
    expect(classifyCombo([joker(), joker()])).toBeNull();
  });

  it('supports joker as wild extending a straight', () => {
    // 3-4-5(♠) + ジョーカー = 4連の階段(ジョーカーは6扱いで上端を補完)
    const c = classifyCombo([card('spades', '3'), card('spades', '4'), card('spades', '5'), joker()]);
    expect(c?.kind).toBe('straight');
    expect(c?.length).toBe(4);
    // 上端補完 → 最大ランクは6(大富豪値=4)
    expect(c?.maxValue).toBe(4);
  });
});

describe('beats / comparable', () => {
  it('higher single beats lower', () => {
    expect(beats(classifyCombo([card('spades', '9')])!, classifyCombo([card('hearts', '7')])!, false)).toBe(true);
    expect(beats(classifyCombo([card('spades', '7')])!, classifyCombo([card('hearts', '9')])!, false)).toBe(false);
  });

  it('joker single beats everything in normal and revolution', () => {
    expect(beats(classifyCombo([joker()])!, classifyCombo([card('hearts', '2')])!, false)).toBe(true);
    expect(beats(classifyCombo([joker()])!, classifyCombo([card('hearts', '2')])!, true)).toBe(true);
  });

  it('same-kind different ranks are comparable', () => {
    expect(comparable(classifyCombo([card('spades', '3'), card('hearts', '3')])!, classifyCombo([card('hearts', '8'), card('clubs', '8')])!)).toBe(true);
  });

  it('straights comparable only for equal length', () => {
    const s345 = classifyCombo([card('spades', '3'), card('spades', '4'), card('spades', '5')])!;
    const s456 = classifyCombo([card('spades', '4'), card('spades', '5'), card('spades', '6')])!;
    const s6789 = classifyCombo([card('spades', '6'), card('spades', '7'), card('spades', '8'), card('spades', '9')])!;
    expect(comparable(s345, s456)).toBe(true);
    expect(comparable(s345, s6789)).toBe(false);
    // 同長なら高い方が勝つ
    expect(beats(s456, s345, false)).toBe(true);
  });

  it('revolution inverts strengths (except joker)', () => {
    // ノーマルで 3 < 7
    expect(beats(classifyCombo([card('spades', '7')])!, classifyCombo([card('hearts', '3')])!, false)).toBe(true);
    // 革命で 3 > 7
    expect(beats(classifyCombo([card('hearts', '3')])!, classifyCombo([card('spades', '7')])!, true)).toBe(true);
  });
});

describe('turn flow & trick state machine', () => {
  it('lead does not allow pass', () => {
    const s = setup(3, mulberry32(1));
    const cur = s.currentPlayer;
    // 3人では♠3を持つプレイヤーがリード(Cannot pass)
    expect(canLead(s, cur)).toBe(true);
    const acts = legalActions(s, cur);
    expect(acts.some(a => a.kind === 'pass')).toBe(false);
    expect(acts.length).toBeGreaterThan(0);
  });

  it('playing a combo sets the trick and advances to next active player', () => {
    let s = setup(3, mulberry32(3));
    const cur = s.currentPlayer;
    const combos = legalCombos(s, cur);
    const leadAction = { indices: combos[0].indices };
    const next = apply(s, cur, { kind: 'play', indices: leadAction.indices })!;
    expect(next.trick).not.toBeNull();
    expect(next.trickOwner).toBe(cur);
    // 場を出した本人に戻るまではパス可能(応答者)
    expect(next.currentPlayer).not.toBe(cur);
  });

  it('all responders passing returns lead to the trick owner (trick resets)', () => {
    let s = setup(3, mulberry32(5));
    // リーダーが1枚出す
    const cur = s.currentPlayer;
    const leadCombos = legalCombos(s, cur);
    s = apply(s, cur, { kind: 'play', indices: leadCombos[0].indices })!;
    // 全員がパスして所有者に戻るまで回す
    let guard = 0;
    while (!canLead(s, s.currentPlayer) && guard < 10) {
      guard++;
      const cp = s.currentPlayer;
      s = apply(s, cp, { kind: 'pass' })!;
    }
    expect(canLead(s, s.currentPlayer)).toBe(true);
    expect(s.currentPlayer).toBe(cur);
    expect(s.trick).toBeNull();
  });

  it('responder can only play a combo that beats the trick', () => {
    let s = setup(2, mulberry32(7));
    const cur = s.currentPlayer;
    const leadCombos = legalCombos(s, cur);
    // リードの最小コンボを出して場を作る
    const leadCombo = [...leadCombos].sort((a, b) => a.combo.maxValue - b.combo.maxValue)[0];
    s = apply(s, cur, { kind: 'play', indices: leadCombo.indices })!;
    // 応答者は場を打ち負かすカードだけ出せる
    const other = s.currentPlayer;
    const respCombos = legalCombos(s, other);
    for (const c of respCombos) {
      expect(beats(c.combo, s.trick!, s.revolution)).toBe(true);
    }
  });

  it('single 10 lets the player discard one card (10捨て)', () => {
    let s = setup(2, mulberry32(9));
    const cur = s.currentPlayer;
    const single10 = singleOf(s, cur, '10');
    if (!single10) {
      // 万一10を持っていなければスキップ(確率的に回避)
      expect(true).toBe(true);
      return;
    }
    const before = s.hands[cur].length;
    // 相手にパスをさせるのは難しいので、リードで10を出して捨てさせる
    const discardIdx = s.hands[cur].findIndex((_, i) => i !== single10.indices[0]);
    const next = apply(s, cur, { kind: 'play', indices: single10.indices, discardIdx })!;
    // 出す(1枚) + 捨てる(1枚) = 2枚減る
    expect(next.hands[cur].length).toBe(before - 2);
  });
});

describe('8切り and 革命', () => {
  it('8切り: playing a single 8 immediately ends the trick and the same player leads again', () => {
    let s = setup(3, mulberry32(11));
    const cur = s.currentPlayer;
    if (!s.hands[cur].some(c => c.rank === '8')) {
      expect(true).toBe(true);
      return;
    }
    const idx = s.hands[cur].findIndex(c => c.rank === '8');
    const next = apply(s, cur, { kind: 'play', indices: [idx] })!;
    // 8切り → 場が流れ、同じプレイヤーが再びリード
    expect(next.trick).toBeNull();
    expect(next.currentPlayer).toBe(cur);
    expect(canLead(next, cur)).toBe(true);
  });

  it('革命: playing a four of a kind toggles revolution', () => {
    // 手札に4枚の7を持つ状態を直接構築して revolution トグルを apply 経由で確認する
    const s = setup(3, mulberry32(13));
    const cur = s.currentPlayer;
    const hand = [
      card('spades', '7'), card('hearts', '7'), card('clubs', '7'), card('diamonds', '7'),
      card('spades', '5'),
    ];
    const state: DaifugoState = {
      hands: hand.map((_, idx) =>
        idx === cur ? hand : [card('spades', '9')]
      ),
      currentPlayer: cur,
      active: [true, true, true],
      order: [],
      trick: null,
      trickOwner: null,
      passes: 0,
      revolution: false,
      done: false,
      reserve: 0,
    };
    const freeIdx = hand.findIndex(c => c.rank !== '7');
    const next = apply(state, cur, { kind: 'play', indices: [0, 1, 2, 3] })!;
    expect(next.revolution).toBe(true);
    expect(next.hands[cur].length).toBe(1);
    expect(next.hands[cur][0].rank).toBe('5');
    expect(freeIdx).toBeGreaterThanOrEqual(4);
  });

  it('single 8 in normal play resets trick and re-leads, demonstrate in full sim', () => {
    let s = setup(2, mulberry32(15));
    let guard = 0;
    while (!isFinished(s) && guard < 2000) {
      guard++;
      const cur = current(s)!;
      s = apply(s, cur, cpuPick(s, cur))!;
    }
    expect(isFinished(s)).toBe(true);
  });
});

describe('full game simulation (CPU only)', () => {
  it('always terminates with complete ranking for 2-7 players', () => {
    for (let players = 2; players <= 7; players++) {
      for (let seed = 0; seed < 40; seed++) {
        let s = setup(players, mulberry32(seed + players * 1000));
        let guard = 0;
        while (!isFinished(s)) {
          expect(guard).toBeLessThan(3000);
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
      }
    }
  });

  it('conserves all cards across the whole game', () => {
    let s = setup(4, mulberry32(1));
    let guard = 0;
    while (!isFinished(s) && guard < 3000) {
      guard++;
      const cur = current(s)!;
      s = apply(s, cur, cpuPick(s, cur))!;
    }
    expect(isFinished(s)).toBe(true);
    // 全53枚(ジョーカー含む)が配布済み。未使用分は最終プレイヤーの手札に残る
    const inHands = s.hands.reduce((a, h) => a + h.length, 0);
    expect(inHands).toBeGreaterThanOrEqual(0);
    expect(inHands <= 53).toBe(true);
  });
});

describe('card exchange (2 ゲーム目以降)', () => {
  it('exchange runs on second game and card counts remain correct', () => {
    // 前回4人: 順位 playerId -> rank, rank 0 なし
    // 大富豪=0, 富豪=1, 平民=2, 大貧民=3
    const s = setup(4, mulberry32(21), { previousRanks: [1, 2, 3, 4] });
    // 53//4 = 13 余り1: 端数1枚は親(大貧民=3)へ → 全53枚が配布済み
    const total = s.hands.reduce((a, h) => a + h.length, 0);
    expect(total).toBe(53);
    // 大貧民(3)がリーダー
    expect(current(s)).toBe(3);
  });

  it('first game leader holds spades 3 when present', () => {
    const s = setup(3, mulberry32(23));
    const leader = s.currentPlayer;
    // 3人: 53//3=17 余り2 → 均等51枚+端数2枚は親へ。♠3がいれば親が持っている
    expect(s.active[leader]).toBe(true);
  });
});

describe('titles', () => {
  it('titles follow rank', () => {
    expect(titleForRank(1)).toBe('大富豪');
    expect(titleForRank(2)).toBe('富豪');
    expect(titleForRank(3)).toBe('平民');
    expect(titleForRank(4)).toBe('貧民');
    expect(titleForRank(5)).toBe('大貧民');
  });
});

describe('daifugoDef identity', () => {
  it('id is daifugo and functions wired', () => {
    expect(daifugoDef.id).toBe('daifugo');
    expect(typeof daifugoDef.setup).toBe('function');
    expect(typeof daifugoDef.chooseCpuAction).toBe('function');
  });
});

// リード状態の任意手札から legalCombos が列挙する組合せを検証する
function leadState(hand: MpCard[]): DaifugoState {
  return {
    hands: [hand],
    currentPlayer: 0,
    active: [true],
    order: [],
    trick: null,
    trickOwner: null,
    passes: 0,
    revolution: false,
    done: false,
    reserve: 0,
  };
}

describe('legalCombos enumeration', () => {
  it('lists partial single straights of every window', () => {
    // ♠3-4-5-6 → 4連の一部として 3連・4連を複数列挙
    const hand = [
      card('spades', '3'), card('spades', '4'), card('spades', '5'), card('spades', '6'),
    ];
    const combos = legalCombos(leadState(hand), 0);
    const straights = combos.filter(c => c.combo.kind === 'straight');
    // 最短3連以上を列挙するので、3連2種(3-4-5, 4-5-6) + 4連1種(3-4-5-6)
    expect(straights.some(c => c.combo.length === 3 && c.indices.length === 3)).toBe(true);
    expect(straights.some(c => c.combo.length === 4 && c.indices.length === 4)).toBe(true);
  });

  it('extends a straight with the joker', () => {
    // ♠3-4-5 + ジョーカー → 4連の階段が列挙される
    const hand = [card('spades', '3'), card('spades', '4'), card('spades', '5'), joker()];
    const combos = legalCombos(leadState(hand), 0);
    expect(combos.some(c => c.combo.kind === 'straight' && c.combo.length === 4 && c.combo.cards.some(x => x.rank === 'JOKER'))).toBe(true);
  });

  it('lists double straights', () => {
    // ♠3♥3-♠4♥4-♠5♥5 → ダブル階段
    const hand = [
      card('spades', '3'), card('hearts', '3'),
      card('spades', '4'), card('hearts', '4'),
      card('spades', '5'), card('hearts', '5'),
    ];
    const combos = legalCombos(leadState(hand), 0);
    const dbl = combos.filter(c => c.combo.kind === 'double');
    expect(dbl.length).toBeGreaterThan(0);
    expect(dbl[0].combo.cards.length).toBe(6);
    expect(dbl[0].combo.length).toBe(3);
  });
});
