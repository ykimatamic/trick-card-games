import { createPlayingDeck, shuffleCards, type MpCard } from './cards';
import type { TurnGameDef } from './contract';

/**
 * 大富豪(Daifugō / 大貧民)
 *
 * 実装ルール:
 * - 使用カード: 52枚 + ジョーカー1枚(53枚)。等分できるだけ配る(余ったカードは山にする)
 * - 強さ: 3 < 4 < ... < K < A < 2、ジョーカーは最強(革命中も最強)
 * - 出し方: 1枚出し / 同じ数字(ペア・スリー・フォー) / 同じマークの連番(階段) / 同じ段数の階段(グレード)
 * - 革命: 同じ数字を4枚以上出すと強さが逆転(3 が最強、2 が最弱)。革命中にもう一度4枚出すと解除
 * - 8切り: 8が含まれる「同じ数字」の組(8単体/88等)を出すと即座に場が流れる
 * - 10捨て: 10を1枚出したとき、手札1枚を任意に捨てられる
 * - 上がり順で階級(大富豪/富豪/平民/貧民/大貧民)が決まる
 * - 2ゲーム目以降は配布後にカード交換(富豪側=弱いカードを、貧民側=強いカードを)
 *   次のゲームは大貧民が親(リーダー)
 */
export interface DaifugoState {
  hands: MpCard[][];
  currentPlayer: number;
  active: boolean[];
  /** 上がり順(先頭=大富豪) */
  order: number[];
  /** 現在の場のコンボ */
  trick: Combo | null;
  /** 場を出した最後のプレイヤー */
  trickOwner: number | null;
  /** 場が流れるまでの連続パス数 */
  passes: number;
  revolution: boolean;
  done: boolean;
  /** 配布で山に残った枚数(端数) */
  reserve: number;
}

export type DaifugoAction =
  | { kind: 'play'; indices: number[]; discardIdx?: number }
  | { kind: 'pass' };

// ---------- カードの強さ ----------

/** 大富豪用の数値(3=1 ... K=11, A=12, 2=13, ジョーカー=14) */
export function valueOf(c: MpCard): number {
  if (c.rank === 'JOKER') return 14;
  switch (c.rank) {
    case '3': return 1;
    case '4': return 2;
    case '5': return 3;
    case '6': return 4;
    case '7': return 5;
    case '8': return 6;
    case '9': return 7;
    case '10': return 8;
    case 'J': return 9;
    case 'Q': return 10;
    case 'K': return 11;
    case 'A': return 12;
    case '2': return 13;
  }
  return 0;
}

// ---------- コンボ分類 ----------

/** 役の種類。straight = 1枚連番、double = 2枚連番(ダブル階段) */
export type ComboKind = 'single' | 'pair' | 'triple' | 'four' | 'straight' | 'double';

export interface Combo {
  kind: ComboKind;
  cards: MpCard[];
  /** 階段の長さ(rank数、それ以外は 1) */
  length: number;
  /** 比較用のランク値(階段は最大値。革命で反転) */
  maxValue: number;
}

/**
 * 与えられたカード一式を1つのコンボとして分類する。
 * ジョーカーは「単体(最強)」または「任意の数字を補完するワイルド」として使える(デッキに1枚)。
 * 対応役: 単体 / ペア / トリプル / フォー / 1枚連番(同マーク,3枚以上) / 2枚連番(ダブル階段)
 * 不正な組み合わせは null。
 */
export function classifyCombo(cards: MpCard[]): Combo | null {
  if (cards.length === 0) return null;
  const jokers = cards.filter(c => c.rank === 'JOKER');
  if (jokers.length > 1) return null; // デッキにジョーカーは1枚のみ
  const normals = cards.filter(c => c.rank !== 'JOKER');

  // 単体
  if (cards.length === 1) {
    return { kind: 'single', cards, length: 1, maxValue: valueOf(cards[0]) };
  }

  const byRank = new Map<string, MpCard[]>();
  for (const c of normals) {
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank)!.push(c);
  }
  const groups = [...byRank.values()];

  // 同数(ペア/トリプル/フォー)。ジョーカーは実カード1枚と組んで補完できる
  if (groups.length <= 1) {
    const real = groups[0] ?? [];
    const total = real.length + jokers.length;
    if (total < 2 || total > 4) return null;
    const kinds: Record<number, ComboKind> = { 2: 'pair', 3: 'triple', 4: 'four' };
    const maxValue = real.length > 0 ? Math.max(...real.map(valueOf)) : 14;
    return { kind: kinds[total], cards, length: 1, maxValue };
  }

  return classifySequence(cards, groups, jokers.length);
}

/** 階段系(1段/2段/ジョーカー補完)の分類。実カードはジョーカーを含まない */
function classifySequence(
  cards: MpCard[],
  groups: MpCard[][],
  jokers: number
): Combo | null {
  // 各 rank グループの枚数がすべて等しいこと
  const counts = new Set(groups.map(g => g.length));
  if (counts.size !== 1) return null;
  const per = groups[0].length;
  if (per < 1 || per > 2) return null;

  const ranks = groups.map(g => valueOf(g[0]));
  const sorted = [...ranks].sort((a, b) => a - b);
  const minV = sorted[0];
  const maxV = sorted[sorted.length - 1];
  if (maxV === 14) return null; // ジョーカー(14)は連番のランクにならない

  const totalRanks = sorted.length + jokers;
  if (totalRanks < 3) return null;

  // 実ランクが連番でない場合の「隙間」の数
  const setR = new Set(sorted);
  let gaps = 0;
  for (let v = minV; v <= maxV; v++) if (!setR.has(v)) gaps++;

  // ジョーカーは端に1枚伸ばす or 隙間1つを埋められる
  const canExtendEnd = gaps === 0;
  const canFillGap = gaps === 1;
  if (!((jokers === 0 && gaps === 0) || (jokers >= 1 && (canExtendEnd || canFillGap)))) {
    return null;
  }

  // 利用するランク最大値(ジョーカーで上端を伸ばす場合は +1)
  const maxValue = jokers >= 1 && canExtendEnd ? maxV + 1 : maxV;
  // 階段の長さ(rank数)
  const length = sorted.length + (jokers === 0 ? 0 : 1);

  // スート制約
  if (per === 1) {
    // 1段(通常)階段: 全実カードが同じマーク(ジョーカーは任意マークで補完)
    const allSuits = new Set<string>();
    for (const g of groups) for (const c of g) allSuits.add(c.suit);
    if (allSuits.size !== 1) return null;
    return { kind: 'straight', cards, length, maxValue };
  }

  // 2段(ダブル階段): ジョーカー無しで、ちょうど2種類のマークを各 rank 同数持つ
  if (jokers > 0) return null;
  const suitCounts = new Map<string, number>();
  for (const g of groups) for (const c of g) suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
  if (suitCounts.size !== 2) return null;
  for (const cnt of suitCounts.values()) if (cnt !== sorted.length) return null;
  return { kind: 'double', cards, length, maxValue };
}

/** 2つのコンボが同じ"種別・形"(枚数)か */
export function comparable(a: Combo, b: Combo): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'single' || a.kind === 'pair' || a.kind === 'triple' || a.kind === 'four') return true;
  // straight / double: 枚数が同じこと
  return a.cards.length === b.cards.length;
}

/** 強さ比較。revolution で反転(ジョーカー単体は常に強)。a が b を「打ち負かせる」か */
export function beats(a: Combo, b: Combo, revolution: boolean): boolean {
  if (!comparable(a, b)) return false;
  // ジョーカー単体は常に最強(革命中も)
  if (a.kind === 'single' && a.maxValue === 14) return true;
  if (b.kind === 'single' && b.maxValue === 14) return false;
  if (revolution) return a.maxValue < b.maxValue;
  return a.maxValue > b.maxValue;
}

// ---------- ゲーム進行 ----------

/**
 * 次ゲームのカード交換情報(前回の順位)。setup が開始前に読み込む。
 * ビューがゲーム終了時の order から previousRanks を設定する。
 */
/** setup のオプション。previousRanks は2ゲーム目以降のカード交換/親決定に使う */
export interface DaifugoSetupContext {
  /** playerId -> 順位(1=大富豪)。次ゲームの交換と親(大貧民)決定に使用 */
  previousRanks?: number[];
}

export function setup(
  playerCount: number,
  rng: () => number = Math.random,
  context?: DaifugoSetupContext
): DaifugoState {
  const opts = context;
  if (playerCount <= 0) {
    // 0人以下では開始できない(配布の除算/配列アクセスを防ぐ)
    return {
      hands: [],
      currentPlayer: -1,
      active: [],
      order: [],
      trick: null,
      trickOwner: null,
      passes: 0,
      revolution: false,
      done: true,
      reserve: 0,
    };
  }
  const deck = shuffleCards(createPlayingDeck(1), rng);
  const hands: MpCard[][] = Array.from({ length: playerCount }, () => []);
  // 端数カードの扱い: まず全員に均等配布
  const reserve = deck.length % playerCount;
  const dealable = deck.length - reserve;
  for (let i = 0; i < dealable; i++) {
    hands[i % playerCount].push({ ...deck[i], faceUp: true });
  }

  // リーダー(親): 2ゲーム目以降は大貧民(最下位)。1ゲーム目は♠3の持ち主
  let leader = -1;
  if (opts?.previousRanks && opts.previousRanks.length === playerCount) {
    const lastRank = Math.max(...opts.previousRanks);
    const daihinmin = opts.previousRanks.indexOf(lastRank);
    leader = daihinmin;
  } else {
    outer: for (let p = 0; p < playerCount; p++) {
      for (const c of hands[p]) {
        if (c.suit === 'spades' && c.rank === '3') {
          leader = p;
          break outer;
        }
      }
    }
    if (leader === -1) leader = 0;
  }

  // 6-1: 端数カード(reserve)は親(リーダー)に表向きで配る
  for (let i = dealable; i < deck.length; i++) {
    hands[leader].push({ ...deck[i], faceUp: true });
  }

  // 2ゲーム目以降のカード交換(大富豪⇔大貧民2枚、富豪⇔貧民1枚)
  if (opts?.previousRanks && opts.previousRanks.length === playerCount) {
    exchangeCards(hands, opts.previousRanks);
  }

  const active = hands.map(h => h.length > 0);

  return {
    hands,
    currentPlayer: active[leader] ? leader : active.indexOf(true),
    active,
    order: [],
    trick: null,
    trickOwner: null,
    passes: 0,
    revolution: false,
    done: false,
    reserve,
  };
}

/** カード交換: previousRanks から 大富豪/富豪 は弱いカードを、大貧民/貧民 は強いカードを渡す(自動) */
function exchangeCards(hands: MpCard[][], ranks: number[]): void {
  const n = hands.length;
  const daifugo = ranks.indexOf(1);
  const daihinmin = ranks.indexOf(n);
  if (daifugo >= 0 && daihinmin >= 0 && daifugo !== daihinmin) {
    // 大富豪 → 弱い2枚 / 大貧民 → 強い2枚
    const richWeak = weakest(hands[daifugo], 2);
    const poorStrong = strongest(hands[daihinmin], 2);
    applyExchange(hands, daifugo, daihinmin, richWeak, poorStrong);
  }
  if (n >= 4) {
    const fuko = ranks.indexOf(2);
    const hinmin = ranks.indexOf(n - 1);
    if (fuko >= 0 && hinmin >= 0 && fuko !== hinmin) {
      const richWeak = weakest(hands[fuko], 1);
      const poorStrong = strongest(hands[hinmin], 1);
      applyExchange(hands, fuko, hinmin, richWeak, poorStrong);
    }
  }
}

function weakest(hand: MpCard[], k: number): MpCard[] {
  return [...hand].sort((a, b) => valueOf(a) - valueOf(b)).slice(0, k);
}
function strongest(hand: MpCard[], k: number): MpCard[] {
  return [...hand].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, k);
}
function applyExchange(
  hands: MpCard[][],
  rich: number,
  poor: number,
  richCards: MpCard[],
  poorCards: MpCard[]
): void {
  const richIds = new Set(richCards.map(c => c.id));
  const poorIds = new Set(poorCards.map(c => c.id));
  hands[rich] = [
    ...hands[rich].filter(c => !richIds.has(c.id)),
    ...poorCards.map(c => ({ ...c })),
  ];
  hands[poor] = [
    ...hands[poor].filter(c => !poorIds.has(c.id)),
    ...richCards.map(c => ({ ...c })),
  ];
}

function nextActive(state: DaifugoState, from: number): number {
  const n = state.hands.length;
  for (let step = 1; step <= n; step++) {
    const p = (from + step) % n;
    if (state.active[p]) return p;
  }
  return -1;
}

export function current(state: DaifugoState): number | null {
  return state.done ? null : state.currentPlayer;
}

/** 現在のプレイヤーが「場を流してリードできる」状態か(場が空 or 自分の場) */
export function canLead(state: DaifugoState, playerId: number): boolean {
  return state.trick === null || state.trickOwner === playerId;
}

/** 手番のプレイヤーが出せる組合せ一覧(場に応じて beat 条件つき) */
export function legalCombos(state: DaifugoState, playerId: number): { indices: number[]; combo: Combo }[] {
  const hand = state.hands[playerId];
  const res: { indices: number[]; combo: Combo }[] = [];
  // 全組合せから有効コンボを列挙(組合せ爆発を防ぐため枚数上限)
  const combos = enumerateCombos(hand);
  const lead = canLead(state, playerId);
  for (const c of combos) {
    if (lead) {
      res.push(c);
    } else if (state.trick && beats(c.combo, state.trick, state.revolution)) {
      res.push(c);
    }
  }
  return res;
}

/** 手札から出せる全てのコンボを列挙(簡易: 単体/同数/連番) */
function enumerateCombos(hand: MpCard[]): { indices: number[]; combo: Combo }[] {
  const out: { indices: number[]; combo: Combo }[] = [];
  const n = hand.length;
  const jokerIdx = hand.findIndex(c => c.rank === 'JOKER');

  // 単体(ジョーカー単体も含む)
  for (let i = 0; i < n; i++) {
    const c = classifyCombo([hand[i]]);
    if (c) out.push({ indices: [i], combo: c });
  }

  // 同数(ペア/スリー/フォー) + ジョーカー補完
  const byValue = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (hand[i].rank === 'JOKER') continue;
    const v = valueOf(hand[i]);
    if (!byValue.has(v)) byValue.set(v, []);
    byValue.get(v)!.push(i);
  }
  for (const [, idxs] of byValue) {
    // 実カードのみ
    for (let k = 2; k <= Math.min(4, idxs.length); k++) {
      const combo = classifyCombo(idxs.slice(0, k).map(i => hand[i]));
      if (combo) out.push({ indices: idxs.slice(0, k), combo });
    }
    // ジョーカーで補完(1枚の実カードにジョーカーを足してペア等)
    if (jokerIdx >= 0) {
      const total = idxs.length + 1;
      if (total >= 2 && total <= 4) {
        const allIdx = [...idxs, jokerIdx];
        const combo = classifyCombo(allIdx.map(i => hand[i]));
        if (combo) {
          // 実カード数が少なく済む組み合わせも列挙(i番目の実カード + ジョーカー)
          if (idxs.length === 1) {
            out.push({ indices: allIdx, combo });
          }
        }
      }
    }
  }

  // 階段(1段: 部分ウィンドウ + ジョーカー補完) / ダブル階段
  out.push(...enumerateStraights(hand, jokerIdx));
  out.push(...enumerateDoubles(hand));
  return out;
}

/** 1段(通常)階段: スート別に連続ウィンドウ(長さ3以上)をすべて列挙 + ジョーカー補完 */
function enumerateStraights(hand: MpCard[], jokerIdx: number): { indices: number[]; combo: Combo }[] {
  const out: { indices: number[]; combo: Combo }[] = [];
  const bySuit = new Map<string, number[]>();
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === 'JOKER') continue;
    if (!bySuit.has(hand[i].suit)) bySuit.set(hand[i].suit, []);
    bySuit.get(hand[i].suit)!.push(i);
  }
  for (const [, idxs] of bySuit) {
    const sorted = [...idxs].sort((a, b) => valueOf(hand[a]) - valueOf(hand[b]));
    let start = 0;
    for (let end = start + 1; end <= sorted.length; end++) {
      if (end === sorted.length || valueOf(hand[sorted[end]]) !== valueOf(hand[sorted[end - 1]]) + 1) {
        const run = sorted.slice(start, end);
        // すべての部分ウィンドウ(長さ3〜run長)を列挙
        for (let l = 3; l <= run.length; l++) {
          for (let s = 0; s + l <= run.length; s++) {
            const win = run.slice(s, s + l);
            const cards = win.map(i => hand[i]);
            const combo = classifyCombo(cards);
            if (combo) out.push({ indices: win, combo });
            // ジョーカーで上端/下端を補完
            if (jokerIdx >= 0) {
              const withJ = [...win, jokerIdx];
              const c2 = classifyCombo(withJ.map(i => hand[i]));
              if (c2) out.push({ indices: withJ, combo: c2 });
            }
          }
        }
        start = end;
      }
    }
  }
  return out;
}

/** ダブル階段(2段): 連続ランクの各rankから2枚ずつ選び、2スートが平行する組み合わせ */
function enumerateDoubles(hand: MpCard[]): { indices: number[]; combo: Combo }[] {
  const out: { indices: number[]; combo: Combo }[] = [];
  const byValue = new Map<number, number[]>();
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === 'JOKER') continue;
    const v = valueOf(hand[i]);
    if (!byValue.has(v)) byValue.set(v, []);
    byValue.get(v)!.push(i);
  }
  const vals = [...byValue.keys()].sort((a, b) => a - b);
  // 各rankから2枚を選ぶ部分集合を探す(連続ウィンドウ)
  let start = 0;
  for (let end = start + 1; end <= vals.length; end++) {
    if (end === vals.length || vals[end] !== vals[end - 1] + 1) {
      const windowVals = vals.slice(start, end);
      if (windowVals.length >= 3 && windowVals.every(v => (byValue.get(v)!.length) >= 2)) {
        // 各rankから最初の2枚を選んで候補を作成(スート検証は classifyCombo に任せる)
        const chosen: number[] = [];
        for (const v of windowVals) chosen.push(...byValue.get(v)!.slice(0, 2));
        const combo = classifyCombo(chosen.map(i => hand[i]));
        if (combo && combo.kind === 'double') {
          out.push({ indices: chosen, combo });
        }
      }
      start = end;
    }
  }
  return out;
}

/** 革命を起こすコンボか(同じ数字を4枚) */
function isRevolutionCombo(combo: Combo): boolean {
  return combo.kind === 'four';
}

/** 8切りコンボか(8を含む同じ数字の組) */
function is8Cut(combo: Combo): boolean {
  if (combo.kind === 'straight') return false;
  return combo.cards.every(c => c.rank === '8');
}

/** 10捨て(1枚の10を出す) */
function isSingle10(combo: Combo): boolean {
  return combo.kind === 'single' && combo.cards[0].rank === '10';
}

export function legalActions(state: DaifugoState, playerId: number): DaifugoAction[] {
  if (state.done || playerId !== state.currentPlayer) return [];
  if (canLead(state, playerId)) {
    // リード時はパス不可
    return legalCombos(state, playerId).map(({ indices }) => ({ kind: 'play' as const, indices }));
  }
  const plays = legalCombos(state, playerId).map(({ indices }) => ({ kind: 'play' as const, indices }));
  return [...plays, { kind: 'pass' }];
}

export function apply(state: DaifugoState, playerId: number, action: DaifugoAction): DaifugoState | null {
  if (state.done || playerId !== state.currentPlayer || !state.active[playerId]) return null;

  const hand = state.hands[playerId];
  if (hand.length === 0) return null;

  const next: DaifugoState = {
    hands: state.hands.map(h => [...h]),
    currentPlayer: playerId,
    active: [...state.active],
    order: [...state.order],
    trick: state.trick ? { ...state.trick, cards: [...state.trick.cards] } : null,
    trickOwner: state.trickOwner,
    passes: state.passes,
    revolution: state.revolution,
    done: false,
    reserve: state.reserve,
  };

  const lead = canLead(state, playerId);

  if (action.kind === 'pass') {
    if (lead) return null; // リード時にパスは不可
    next.passes += 1;
  } else {
    // プレイ
    if (action.indices.length === 0) return null;
    const cards = action.indices.map(i => hand[i]);
    const combo = classifyCombo(cards);
    if (!combo) return null;

    if (lead) {
      // 任意の有効コンボ
    } else {
      if (!state.trick) return null;
      if (!beats(combo, state.trick, state.revolution)) return null;
    }

    // 手札から除去
    const idxSet = new Set(action.indices);
    next.hands[playerId] = hand.filter((_, i) => !idxSet.has(i));
    next.trick = combo;
    next.trickOwner = playerId;
    next.passes = 0;

    // 革命
    if (isRevolutionCombo(combo)) {
      next.revolution = !next.revolution;
    }
  }

  // 上がり判定
  const outNow = next.hands[playerId].length === 0;
  if (outNow && next.active[playerId]) {
    next.active[playerId] = false;
    next.order.push(playerId);
    // 10捨ては上がりの手番では使わない(捨てる手番なし)
  } else if (action.kind === 'play' && isSingle10(next.trick!)) {
    // 10捨て: リード時は手札から1枚捨てられる(選択がある場合のみ)
    if (action.discardIdx !== undefined) {
      const d = hand[action.discardIdx];
      if (d && action.indices.indexOf(action.discardIdx) < 0) {
        // 元の手札の index ではなくカードIDで除去(除去後の手札と index がずれるため)
        next.hands[playerId] = next.hands[playerId].filter(c => c.id !== d.id);
        if (next.hands[playerId].length === 0 && next.active[playerId]) {
          next.active[playerId] = false;
          next.order.push(playerId);
        }
      }
    }
  }

  // 8切り: 場を即流し、同じプレイヤーが再度リード
  if (action.kind === 'play' && is8Cut(next.trick!)) {
    next.trick = null;
    next.trickOwner = null;
    next.passes = 0;
    // 上がっていなければ同じプレイヤーが続けてリード(active 確認)
    next.currentPlayer = next.active[playerId] ? playerId : nextActive(next, playerId);
    // 終了判定
    if (next.active.filter(Boolean).length <= 1) {
      finishGame(next);
    }
    return next;
  }

  // 残り1人以下なら終了
  if (next.active.filter(Boolean).length <= 1) {
    finishGame(next);
    next.currentPlayer = -1;
    return next;
  }

  // 次のプレイヤーへ
  const nxt = nextActive(next, playerId);
  next.currentPlayer = nxt;

  // 場のリセット判定
  if (next.trick !== null) {
    if (next.trickOwner === nxt) {
      // 他の全員がパス → リード
      next.trick = null;
      next.trickOwner = null;
      next.passes = 0;
    } else if (next.trickOwner != null && !next.active[next.trickOwner] && next.passes >= next.active.filter(Boolean).length - 1) {
      next.trick = null;
      next.trickOwner = null;
      next.passes = 0;
    }
  }

  return next;
}

function finishGame(state: DaifugoState): void {
  state.done = true;
  // 最後の残りのプレイヤーを order へ
  const last = state.active.indexOf(true);
  if (last >= 0 && !state.order.includes(last)) {
    state.order.push(last);
  }
  state.currentPlayer = -1;
  state.trick = null;
  state.trickOwner = null;
}

export function isFinished(state: DaifugoState): boolean {
  return state.done;
}

export function results(state: DaifugoState): { playerId: number; rank: number; isLoser: boolean }[] {
  const n = state.order.length;
  return state.order.map((pid, i) => ({
    playerId: pid,
    rank: i + 1,
    isLoser: i === n - 1 && n > 1,
  }));
}

const TITLES = ['大富豪', '富豪', '平民', '貧民', '大貧民'];
export function titleForRank(rank: number): string {
  const n = TITLES.length;
  if (rank <= 1) return TITLES[0];
  if (rank === 2) return TITLES[1];
  if (rank <= n - 2) return TITLES[2];
  if (rank === n - 1) return TITLES[3];
  return TITLES[n - 1];
}

/** CPU: 出すべき手を選ぶ。リードなら使える最小、応答なら場を打ち負かす最小。パスも検討 */
export function cpuPick(state: DaifugoState, playerId: number): DaifugoAction {
  const options = legalCombos(state, playerId);
  if (options.length === 0) return { kind: 'pass' };
  const lead = canLead(state, playerId);
  if (lead) {
    // 最小の手(枚数が少なく、強さが小さいもの)を選択
    const sorted = [...options].sort((a, b) => {
      if (a.combo.cards.length !== b.combo.cards.length) return a.combo.cards.length - b.combo.cards.length;
      return a.combo.maxValue - b.combo.maxValue;
    });
    const pick = sorted[0];
    const discardIdx = isSingle10(pick.combo) && state.hands[playerId].length > 1
      ? weakestIndex(state.hands[playerId], pick.indices)
      : undefined;
    return { kind: 'play', indices: pick.indices, discardIdx };
  }
  // 場を打ち負かす最小を選ぶ(パスも許容: 極端に弱い手ならパス)
  const sorted = [...options].sort((a, b) => a.combo.maxValue - b.combo.maxValue);
  const pick = sorted[0];
  const discardIdx = isSingle10(pick.combo) && state.hands[playerId].length > 1
    ? weakestIndex(state.hands[playerId], pick.indices)
    : undefined;
  return { kind: 'play', indices: pick.indices, discardIdx };
}

function weakestIndex(hand: MpCard[], exclude: number[]): number {
  let bi = -1; let bv = Infinity;
  for (let i = 0; i < hand.length; i++) {
    if (exclude.includes(i)) continue;
    const v = valueOf(hand[i]);
    if (v < bv) { bv = v; bi = i; }
  }
  return bi;
}

export const daifugoDef: TurnGameDef<DaifugoState, DaifugoAction> = {
  id: 'daifugo',
  setup,
  currentPlayer: current,
  legalActions,
  apply,
  isFinished,
  results,
  chooseCpuAction: cpuPick,
};
