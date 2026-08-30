import { createPlayingDeck, shuffleCards, type MpCard } from './cards';
import type { TurnGameDef } from './contract';

/**
 * 5カードドロー ポーカー(5 Card Draw)
 *
 * - 各プレイヤーに5枚配布。ベット → ドロー(交換) → ベット → ショウダウン の流れ
 * - 役判定は ロイヤルフラッシュ 〜 ハイカード の9種 + キッカー(同役なら高い方)
 * - ベット: フォールド / コール / レイズ。全員が同額を賭け終えるか、残り1人ならラウンド終了
 * - ショウダウンで最も強い役のプレイヤーがポット(アンティ+ベット合計)を獲得
 */
export type PokerPhase = 'bet1' | 'draw' | 'bet2' | 'next' | 'done';

export type PokerHandKind =
  | 'royal flush'
  | 'straight flush'
  | 'four of a kind'
  | 'full house'
  | 'flush'
  | 'straight'
  | 'three of a kind'
  | 'two pair'
  | 'pair'
  | 'high card';

export interface EvaluatedHand {
  kind: PokerHandKind;
  value: number;
}

export interface PokerState {
  deck: MpCard[];
  hands: MpCard[][];
  chips: number[];
  ante: number;
  pot: number;
  phase: PokerPhase;
  currentPlayer: number;
  folded: boolean[];
  roundBets: number[];      // このラウンドで賭けた額
  currentBet: number;       // ラウンド内の最高ベット
  actedRound: boolean[];    // このラウンドで一度は着手したか
  discardDone: boolean[];   // ドローで交換を終えたか
  showdown: { playerId: number; kind: PokerHandKind; label: string }[] | null;
  winner: number | null;
  done: boolean;
  /** マルチハンド戦(連戦)用 */
  handNumber: number;       // 現在のハンド数(1〜)
  maxHands: number;         // 上限ハンド数(超えたらマッチ終了)
  broke: boolean[];         // 破産(チップ0)で脱落したプレイヤー
  rng: () => number;        // 新ハンドでデッキをシャッフルするための乱数源
  match: boolean;           // マルチハンド戦モードか
}

export type PokerAction =
  | { type: 'fold' }
  | { type: 'call' }
  | { type: 'raise'; amount: number }   // 追加ベット額(currentBet に上乗せ)
  | { type: 'discard'; indexes: number[] }
  | { type: 'next' };   // ショウダウン後に次のハンドへ(マッチ継続時に手を見せる)

export interface PokerSetupContext {
  startChips?: number;
  ante?: number;
  /** マルチハンド戦の上限ハンド数。デフォルト 10 */
  maxHands?: number;
  /** マルチハンド戦を無効にして単ハンドにするか(デフォルト false) */
  singleHand?: boolean;
}

const KIND_ORDER: Record<PokerHandKind, number> = {
  'high card': 0,
  pair: 1,
  'two pair': 2,
  'three of a kind': 3,
  straight: 4,
  flush: 5,
  'full house': 6,
  'four of a kind': 7,
  'straight flush': 8,
  'royal flush': 9,
};

const KIND_LABEL: Record<PokerHandKind, string> = {
  'royal flush': 'ロイヤルストレートフラッシュ',
  'straight flush': 'ストレートフラッシュ',
  'four of a kind': 'フォーカード',
  'full house': 'フルハウス',
  flush: 'フラッシュ',
  straight: 'ストレート',
  'three of a kind': 'スリーカード',
  'two pair': 'ツーペア',
  pair: 'ワンペア',
  'high card': 'ハイカード',
};

export function kindLabel(kind: PokerHandKind): string {
  return KIND_LABEL[kind];
}

function rankNum(c: MpCard): number {
  if (c.rank === 'JOKER') return 0;
  if (c.rank === 'A') return 14;
  if (c.rank === 'K') return 13;
  if (c.rank === 'Q') return 12;
  if (c.rank === 'J') return 11;
  return Number(c.rank);
}

const KIND_BASE = 15 ** 5; // キッカー合成(最大5成分 × <15)より大きい基準で役を支配

function valueOf(kind: PokerHandKind, comps: number[]): number {
  let kick = 0;
  for (const c of comps) kick = kick * 15 + c;
  return KIND_ORDER[kind] * KIND_BASE + kick;
}

/** 5枚の手札を評価して役と比較可能な値(高いほど強い)を返す */
export function evaluateHand(cards: MpCard[]): EvaluatedHand {
  const vals = cards.map(rankNum).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const byCount: number[][] = [[], [], [], [], []];
  for (const [v, n] of counts) byCount[n].push(v);
  for (const g of byCount) g.sort((a, b) => b - a);

  const isFlush = cards.every(c => c.suit === cards[0].suit);
  let straightHigh = 0;
  const uniq = [...new Set(vals)].sort((a, b) => b - a);
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5; // A-2-3-4-5 (ホイール)
  }

  if (isFlush && straightHigh === 14) return { kind: 'royal flush', value: valueOf('royal flush', [14]) };
  if (isFlush && straightHigh) return { kind: 'straight flush', value: valueOf('straight flush', [straightHigh]) };

  if (byCount[4].length) {
    const kicker = byCount[1][0] ?? 0;
    return { kind: 'four of a kind', value: valueOf('four of a kind', [byCount[4][0], kicker]) };
  }
  if (byCount[3].length && byCount[2].length) {
    return { kind: 'full house', value: valueOf('full house', [byCount[3][0], byCount[2][0]]) };
  }
  if (isFlush) return { kind: 'flush', value: valueOf('flush', vals) };
  if (straightHigh) return { kind: 'straight', value: valueOf('straight', [straightHigh]) };
  if (byCount[3].length) {
    const kickers = byCount[1].sort((a, b) => b - a);
    return { kind: 'three of a kind', value: valueOf('three of a kind', [byCount[3][0], kickers[0], kickers[1]]) };
  }
  if (byCount[2].length >= 2) {
    const pairs = byCount[2].sort((a, b) => b - a);
    const kicker = byCount[1][0] ?? 0;
    return { kind: 'two pair', value: valueOf('two pair', [pairs[0], pairs[1], kicker]) };
  }
  if (byCount[2].length === 1) {
    const kickers = byCount[1].sort((a, b) => b - a);
    return { kind: 'pair', value: valueOf('pair', [byCount[2][0], kickers[0], kickers[1], kickers[2]]) };
  }
  return { kind: 'high card', value: valueOf('high card', vals) };
}

function clone(s: PokerState): PokerState {
  return {
    ...s,
    deck: [...s.deck],
    chips: [...s.chips],
    hands: s.hands.map(h => [...h]),
    folded: [...s.folded],
    roundBets: [...s.roundBets],
    actedRound: [...s.actedRound],
    discardDone: [...s.discardDone],
    broke: [...s.broke],
    showdown: s.showdown ? s.showdown.map(x => ({ ...x })) : null,
  };
}

/** まだチップを持つ(=マッチに参加中)プレイヤー */
function activeChipPlayers(state: PokerState): number[] {
  return state.hands.map((_, p) => p).filter(p => state.chips[p] > 0);
}

/** 新しいハンド(1回の勝負)をディールしてマッチを継続する */
function dealHand(state: PokerState): PokerState {
  const next = clone(state);
  next.handNumber += 1;
  next.deck = shuffleCards(createPlayingDeck(0), next.rng);
  next.hands = next.hands.map(() => []);
  const players = activeChipPlayers(next);
  let d = next.deck;
  for (let round = 0; round < 5; round++) {
    for (const p of players) {
      const c = d[d.length - 1];
      d = d.slice(0, d.length - 1);
      next.hands[p].push({ ...c, faceUp: p === 0 });
    }
  }
  next.deck = d;
  next.pot = 0;
  for (const p of players) {
    const capped = Math.min(next.chips[p], next.ante);
    next.chips[p] -= capped;
    next.pot += capped;
  }
  // アンティ支払いでチップ0になったプレイヤーは破産扱い
  for (const p of players) {
    if (next.chips[p] <= 0) next.broke[p] = true;
  }
  next.phase = 'bet1';
  next.currentPlayer = players.length > 0 ? players[0] : -1;
  next.folded = next.folded.map(() => false);
  next.roundBets = next.roundBets.map(() => 0);
  next.currentBet = 0;
  next.actedRound = next.actedRound.map(() => false);
  next.discardDone = next.discardDone.map(() => false);
  next.showdown = null;
  next.winner = null;
  next.done = false;
  return next;
}

/** 1ハンドが終わった後、マッチを続けるか終えるかを決める */
function finishHand(state: PokerState): PokerState {
  if (!state.match || activeChipPlayers(state).length <= 1 || state.handNumber >= state.maxHands) {
    state.currentPlayer = -1;
    state.phase = 'done';
    state.done = true;
    return state;
  }
  // ショウダウン(勝負になった)場合は手を見せるため、次のハンドへ進む前に一時停止
  if (state.showdown) {
    state.phase = 'next';
    state.currentPlayer = 0;
    return state;
  }
  return dealHand(state);
}

export function setup(
  playerCount: number,
  rng: () => number = Math.random,
  context?: PokerSetupContext
): PokerState {
  const startChips = context?.startChips ?? 500;
  const ante = Math.min(context?.ante ?? 10, startChips);
  const maxHands = context?.maxHands ?? 10;
  const match = !(context?.singleHand === true);
  const base: PokerState = {
    deck: [],
    hands: Array.from({ length: playerCount }, () => []),
    chips: Array.from({ length: playerCount }, () => startChips),
    ante,
    pot: 0,
    phase: 'bet1',
    currentPlayer: 0,
    folded: Array.from({ length: playerCount }, () => false),
    roundBets: Array.from({ length: playerCount }, () => 0),
    currentBet: 0,
    actedRound: Array.from({ length: playerCount }, () => false),
    discardDone: Array.from({ length: playerCount }, () => false),
    showdown: null,
    winner: null,
    done: false,
    handNumber: 0,
    maxHands,
    broke: Array.from({ length: playerCount }, () => false),
    rng,
    match,
  };
  // 単ハンドでも1手目はディール対象にするため、初期からデッキを作る
  const first = dealHand(base);
  if (!match) {
    // 単ハンド: アンティは一度だけ(ディール済み)で、マッチ継続しない
    first.handNumber = 1;
    first.maxHands = 1;
  }
  return first;
}

export function current(state: PokerState): number | null {
  if (state.done) return null;
  return state.currentPlayer;
}

function remainingActive(state: PokerState): number {
  return state.folded.filter(f => !f).length;
}

/** プレイヤーがこのラウンドで「掛金がそろった」状態か(オールイン含む) */
function isSettled(state: PokerState, p: number): boolean {
  if (state.folded[p]) return true;
  return state.actedRound[p] && (state.roundBets[p] === state.currentBet || state.chips[p] <= 0);
}

/** ベットの次に着手すべきプレイヤー(いなければ -1) */
function nextBettingPlayer(state: PokerState): number {
  const n = state.hands.length;
  for (let step = 1; step <= n; step++) {
    const p = (state.currentPlayer + step) % n;
    if (!state.folded[p] && !isSettled(state, p)) return p;
  }
  return -1;
}

function bettingRoundComplete(state: PokerState): boolean {
  if (remainingActive(state) <= 1) return true;
  for (let p = 0; p < state.hands.length; p++) {
    if (!state.folded[p] && !isSettled(state, p)) return false;
  }
  return true;
}

function pay(state: PokerState, p: number, amount: number): number {
  const capped = Math.min(state.chips[p], amount);
  state.chips[p] -= capped;
  if (state.chips[p] <= 0) state.broke[p] = true;
  state.pot += capped;
  return capped;
}

function foldWin(state: PokerState, winner: number): PokerState {
  state.chips[winner] += state.pot;
  state.pot = 0;
  state.winner = winner;
  return finishHand(state);
}

function showdown(state: PokerState): PokerState {
  const alive = state.hands.map((_, p) => p).filter(p => !state.folded[p]);
  const evaled = alive.map(p => ({ playerId: p, ...evaluateHand(state.hands[p]) }));
  evaled.sort((a, b) => b.value - a.value);
  const best = evaled[0].value;
  const winners = evaled.filter(e => e.value === best).map(e => e.playerId);
  const base = Math.floor(state.pot / winners.length);
  let remainder = state.pot - base * winners.length;
  const ordered = [...winners].sort((a, b) => a - b);
  for (const w of ordered) {
    state.chips[w] += base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  }
  state.pot = 0;
  state.showdown = evaled.map(e => ({ playerId: e.playerId, kind: e.kind, label: KIND_LABEL[e.kind] }));
  state.winner = ordered[0];
  return finishHand(state);
}

/** ベットアクション適用後の進行(ラウンド完了なら次フェーズへ) */
function advanceAfterBet(state: PokerState): PokerState {
  const alive = remainingActive(state);
  if (alive === 0) {
    // 全員フォールド → 勝者なしで終了
    state.phase = 'done';
    state.currentPlayer = -1;
    state.winner = null;
    state.done = true;
    return state;
  }
  if (alive === 1) {
    const winner = state.folded.findIndex(f => !f);
    return foldWin(state, winner);
  }
  if (!bettingRoundComplete(state)) {
    state.currentPlayer = nextBettingPlayer(state);
    return state;
  }
  // ラウンド完了
  if (state.phase === 'bet1') {
    state.phase = 'draw';
    state.roundBets = Array.from({ length: state.hands.length }, () => 0);
    state.currentBet = 0;
    state.actedRound = Array.from({ length: state.hands.length }, () => false);
    // 最初に交換するプレイヤー
    state.currentPlayer = state.hands.map((_, p) => p).find(p => !state.folded[p]) ?? 0;
    return state;
  }
  // bet2 完了 → ショウダウン
  return showdown(state);
}

export function legalActions(state: PokerState, playerId: number): PokerAction[] {
  if (state.done) return [];
  if (state.phase === 'bet1' || state.phase === 'bet2') {
    const acts: PokerAction[] = [{ type: 'fold' }, { type: 'call' }];
    // 持っているチップでレイズ可能なら代表レイズ額(アンティ相当)を提示
    if (state.chips[playerId] > 0 && state.chips[playerId] + state.roundBets[playerId] > state.currentBet) {
      acts.push({ type: 'raise', amount: Math.max(state.ante, 1) });
    }
    return acts;
  }
  if (state.phase === 'draw') {
    // 交換可能な枚数を示す代表アクション(実際の選択は UI が行う)
    return [{ type: 'discard', indexes: [] }, { type: 'discard', indexes: state.hands[playerId].map((_, i) => i) }];
  }
  if (state.phase === 'next' && playerId === 0) {
    return [{ type: 'next' }];
  }
  return [];
}

export function apply(
  state: PokerState,
  playerId: number,
  action: PokerAction
): PokerState | null {
  if (state.done) return null;
  if (playerId !== state.currentPlayer) return null;

  if (state.phase === 'bet1' || state.phase === 'bet2') {
    const next = clone(state);
    if (next.folded[playerId]) return null;
    switch (action.type) {
      case 'fold': {
        next.folded[playerId] = true;
        next.actedRound[playerId] = true;
        return advanceAfterBet(next);
      }
      case 'call': {
        const need = next.currentBet - next.roundBets[playerId];
        pay(next, playerId, need);
        next.roundBets[playerId] = next.currentBet;
        next.actedRound[playerId] = true;
        return advanceAfterBet(next);
      }
      case 'raise': {
        if (action.amount <= 0) return null;
        const maxNewBet = next.roundBets[playerId] + next.chips[playerId];
        let newBet = next.currentBet + action.amount;
        if (newBet <= next.currentBet) return null;
        if (newBet > maxNewBet) newBet = maxNewBet;
        // キャップ後に currentBet を超えられない場合は(ショートスタック)不正なレイズ
        if (newBet <= next.currentBet) return null;
        const paid = pay(next, playerId, newBet - next.roundBets[playerId]);
        next.roundBets[playerId] += paid;
        next.currentBet = next.roundBets[playerId];
        next.actedRound[playerId] = true;
        // 他の非フォールドのプレイヤーは再度応答が必要
        for (let p = 0; p < next.hands.length; p++) {
          if (p !== playerId && !next.folded[p]) next.actedRound[p] = false;
        }
        return advanceAfterBet(next);
      }
      default:
        return null;
    }
  }

  if (state.phase === 'draw') {
    const next = clone(state);
    if (next.folded[playerId]) return null;
    if (next.discardDone[playerId]) return null;
    if (action.type !== 'discard') return null;
    let idxs = [...new Set(action.indexes)].filter(i => i >= 0 && i < state.hands[playerId].length).sort((a, b) => b - a);
    idxs = idxs.slice(0, 5);
    const drawCount = Math.min(idxs.length, next.deck.length);
    idxs = idxs.slice(0, drawCount);
    const hand = [...state.hands[playerId]];
    for (const i of idxs) hand.splice(i, 1);
    const added: MpCard[] = [];
    let deck = next.deck;
    for (let k = 0; k < drawCount; k++) {
      const c = deck[deck.length - 1];
      deck = deck.slice(0, deck.length - 1);
      added.push({ ...c, faceUp: playerId === 0 });
    }
    next.hands[playerId] = [...hand, ...added];
    next.deck = deck;
    next.discardDone[playerId] = true;
    // 次の交換プレイヤー
    const nextPlayer = state.hands.map((_, p) => p).find(p => !next.folded[p] && !next.discardDone[p]);
    if (nextPlayer === undefined) {
      // 全員の交換が終わった → bet2
      next.phase = 'bet2';
      next.roundBets = Array.from({ length: next.hands.length }, () => 0);
      next.currentBet = 0;
      next.actedRound = Array.from({ length: next.hands.length }, () => false);
      next.currentPlayer = next.hands.map((_, p) => p).find(p => !next.folded[p]) ?? 0;
    } else {
      next.currentPlayer = nextPlayer;
    }
    return next;
  }

  if (state.phase === 'next') {
    // ショウダウン後の一時停止 → 人間が「次のハンド」で続行
    if (playerId !== 0) return null;
    if (action.type !== 'next') return null;
    return dealHand(state);
  }

  return null;
}

export function isFinished(state: PokerState): boolean {
  return state.done;
}

/** 結果: 最終チップが多い順に順位付け(最下位を敗北扱い) */
export function results(state: PokerState): { playerId: number; rank: number; isLoser: boolean }[] {
  const order = state.hands
    .map((_, p) => p)
    .sort((a, b) => state.chips[b] - state.chips[a] || a - b);
  return order.map((p, i) => ({
    playerId: p,
    rank: i + 1,
    isLoser: i === order.length - 1,
  }));
}

// ---- CPU ----

/** 役の強さ 0..1 */
function strengthOf(evaled: EvaluatedHand): number {
  return KIND_ORDER[evaled.kind] / 9;
}

function maxRaiseAmount(state: PokerState, p: number): number {
  return Math.max(0, state.roundBets[p] + state.chips[p] - state.currentBet);
}

/** CPU のベット選択 */
export function cpuBet(state: PokerState, p: number, rng: () => number = Math.random): PokerAction {
  const changesCount = remainingActive(state);
  const str = strengthOf(evaluateHand(state.hands[p]));
  const toCall = state.currentBet - state.roundBets[p];
  const canRaise = maxRaiseAmount(state, p) >= 1;

  if (!canRaise) return { type: 'call' };
  if (toCall === 0) {
    // チェックかベット
    if (str > 0.5 && rng() < str - 0.3) {
      return { type: 'raise', amount: Math.max(state.ante, 1) };
    }
    return { type: 'call' };
  }
  // コールが必要
  const foldProb = 0.4 * (1 - str) * (changesCount > 2 ? 1 : 0.6);
  if (rng() < foldProb) return { type: 'fold' };
  if (str > 0.55 && rng() < str - 0.3 && canRaise) {
    return { type: 'raise', amount: Math.max(state.ante, 1) };
  }
  return { type: 'call' };
}

/** 4枚同じスートか / 連番4枚(ストレート補助)か */
function hasFourToFlushOrStraight(cards: MpCard[]): boolean {
  const suits = new Map<string, number>();
  for (const c of cards) suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1);
  if ([...suits.values()].some(n => n >= 4)) return true;
  const vals = cards.map(rankNum).sort((a, b) => b - a);
  const uniq = [...new Set(vals)].sort((a, b) => b - a);
  for (let i = 0; i + 4 <= uniq.length; i++) {
    if (uniq[i] - uniq[i + 3] <= 4) return true; // 4枚でほぼ連番
  }
  return false;
}

/** CPU の交換選択: 捨てるカードのインデックスを返す */
export function cpuDiscard(cards: MpCard[]): number[] {
  const vals = cards.map(rankNum);
  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => (counts.get(b[0]) ?? 0) - (counts.get(a[0]) ?? 0) || b[0] - a[0]);
  const topCount = groups[0] ? (counts.get(groups[0][0]) ?? 0) : 0;

  if (topCount >= 3) {
    const keepRank = groups[0][0];
    if (topCount === 4) {
      // フォーカード → 残り1枚を交換
      return indexesToDiscard(cards, r => rankNum(r) !== keepRank);
    }
    // スリーカード → 残り2枚を交換
    return indexesToDiscard(cards, r => rankNum(r) !== keepRank);
  }
  if (topCount === 2 && groups.length >= 2 && (counts.get(groups[1][0]) ?? 0) === 2) {
    // ツーペア → 残り1枚を交換
    const keep = new Set([groups[0][0], groups[1][0]]);
    return indexesToDiscard(cards, r => !keep.has(rankNum(r)));
  }
  if (topCount === 2) {
    // ワンペア → ペア以外3枚を交換
    const keepRank = groups[0][0];
    return indexesToDiscard(cards, r => rankNum(r) !== keepRank);
  }
  // ハイカード
  if (hasFourToFlushOrStraight(cards)) {
    // 4枚でそろっている → 1枚だけ交換(4枚は残す)
    return __weakDiscard(cards, 4);
  }
  return __weakDiscard(cards, 3);
}

function indexesToDiscard(cards: MpCard[], drop: (c: MpCard) => boolean): number[] {
  return cards.map((c, i) => (drop(c) ? i : -1)).filter(i => i >= 0);
}

function __weakDiscard(cards: MpCard[], keep: number): number[] {
  const ranked = cards
    .map((c, i) => ({ i, v: rankNum(c) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, keep)
    .map(x => x.i);
  return cards.map((_, i) => (ranked.includes(i) ? -1 : i)).filter(i => i >= 0);
}

export function chooseCpuAction(state: PokerState, playerId: number): PokerAction | null {
  if (state.done) return null;
  if (state.phase === 'bet1' || state.phase === 'bet2') {
    return cpuBet(state, playerId);
  }
  if (state.phase === 'draw' && playerId === state.currentPlayer) {
    const hand = state.hands[playerId];
    return { type: 'discard', indexes: cpuDiscard(hand) };
  }
  if (state.phase === 'next') {
    return { type: 'next' };
  }
  return null;
}

export const pokerDef: TurnGameDef<PokerState, PokerAction> = {
  id: 'poker',
  setup,
  currentPlayer: current,
  legalActions,
  apply,
  isFinished,
  results,
  chooseCpuAction,
};
