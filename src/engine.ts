import type { Card, GameState } from './types';
import { RANK_VALUES } from './types';
import {
  type Move,
  createDeck,
  dealCards,
  findLegalMoves,
  moveCards,
  flipFromStock,
  canPlaceOnTableau,
  canPlaceOnFoundation,
  getCardColor,
  mulberry32,
  FOUNDATION_SUITS,
  isSafeFoundationSend,
} from './game';

export type Action =
  | { kind: 'move'; move: Move }
  | { kind: 'draw' };

export function serializeState(state: GameState): string {
  const stock = state.stock.map(c => c.id).join(',');
  const waste = state.waste.map(c => c.id).join(',');
  const foundations = state.foundations.map(f => String(f.length)).join(',');
  const tableau = state.tableau
    .map(pile => pile.map(c => `${c.id}${c.faceUp ? 'u' : 'd'}`).join(','))
    .join('|');
  return `${stock};${waste};${foundations};${tableau}`;
}

export function applyAction(state: GameState, action: Action): GameState | null {
  if (action.kind === 'draw') return flipFromStock(state);
  const m = action.move;
  return moveCards(state, m.sourceType, m.sourceIndex, m.targetType, m.targetIndex, m.cardCount);
}

function faceUpRunLength(pile: Card[]): number {
  let n = 0;
  while (n < pile.length && pile[pile.length - 1 - n].faceUp) {
    n++;
  }
  return n;
}

function fitsOn(card: Card, targetTop: Card): boolean {
  return (
    getCardColor(card.suit) !== getCardColor(targetTop.suit) &&
    RANK_VALUES[card.rank] === RANK_VALUES[targetTop.rank] - 1
  );
}

function foundationMovesOf(state: GameState): Move[] {
  return findLegalMoves(state).filter(
    m => m.targetType === 'foundation' && m.sourceType !== 'foundation'
  );
}

function foundationCardOf(state: GameState, m: Move): Card {
  if (m.sourceType === 'waste') return state.waste[state.waste.length - 1];
  return state.tableau[m.sourceIndex][state.tableau[m.sourceIndex].length - 1];
}

function sortByRankAsc(state: GameState, actions: Action[]): Action[] {
  return actions.sort((a, b) => {
    if (a.kind !== 'move' || b.kind !== 'move') return 0;
    return (
      RANK_VALUES[foundationCardOf(state, a.move).rank] -
      RANK_VALUES[foundationCardOf(state, b.move).rank]
    );
  });
}

function safeFoundationActions(state: GameState): Action[] {
  const actions = foundationMovesOf(state)
    .filter(m => isSafeFoundationSend(foundationCardOf(state, m), state.foundations, state.foundationSuits))
    .map(move => ({ kind: 'move', move }) as Action);
  return sortByRankAsc(state, actions);
}

function unsafeFoundationActions(state: GameState): Action[] {
  const actions = foundationMovesOf(state)
    .filter(m => !isSafeFoundationSend(foundationCardOf(state, m), state.foundations, state.foundationSuits))
    .map(move => ({ kind: 'move', move }) as Action);
  return sortByRankAsc(state, actions);
}

function revealingActions(state: GameState): Action[] {
  const actions: Action[] = [];
  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i];
    const run = faceUpRunLength(pile);
    if (run === 0 || pile.length <= run) continue;
    const head = pile[pile.length - run];
    for (let t = 0; t < state.tableau.length; t++) {
      if (t === i) continue;
      if (canPlaceOnTableau(head, state.tableau[t])) {
        actions.push({
          kind: 'move',
          move: { sourceType: 'tableau', sourceIndex: i, targetType: 'tableau', targetIndex: t, cardCount: run },
        });
      }
    }
  }
  return actions;
}

function wasteToTableauActions(state: GameState): Action[] {
  return findLegalMoves(state)
    .filter(m => m.sourceType === 'waste' && m.targetType === 'tableau')
    .map(move => ({ kind: 'move', move }) as Action);
}

function exposureCreatesPlacement(state: GameState, sourcePile: number, exposed: Card): boolean {
  for (let j = 0; j < state.tableau.length; j++) {
    if (j === sourcePile) continue;
    const pile = state.tableau[j];
    if (pile.length === 0) continue;
    if (fitsOn(pile[pile.length - 1], exposed)) return true;
  }
  if (state.waste.length > 0 && fitsOn(state.waste[state.waste.length - 1], exposed)) return true;
  return false;
}

function exposureActions(state: GameState): Action[] {
  const actions: Action[] = [];
  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i];
    const run = faceUpRunLength(pile);
    if (run < 2) continue;
    for (let k = 1; k < run; k++) {
      const head = pile[pile.length - k];
      const exposed = pile[pile.length - k - 1];
      if (!exposureCreatesPlacement(state, i, exposed)) continue;
      for (let t = 0; t < state.tableau.length; t++) {
        if (t === i) continue;
        if (canPlaceOnTableau(head, state.tableau[t])) {
          actions.push({
            kind: 'move',
            move: { sourceType: 'tableau', sourceIndex: i, targetType: 'tableau', targetIndex: t, cardCount: k },
          });
        }
      }
    }
  }
  return actions;
}

function moveKey(m: Move): string {
  return `${m.sourceType}[${m.sourceIndex}]->${m.targetType}[${m.targetIndex}]x${m.cardCount}`;
}

function shuffleCandidates(state: GameState, existing: Action[]): Action[] {
  const used = new Set(existing.map(a => (a.kind === 'move' ? moveKey(a.move) : '')));
  return findLegalMoves(state)
    .filter(m => m.sourceType === 'tableau' && m.targetType === 'tableau')
    .filter(m => !used.has(moveKey(m)))
    .map(move => ({ kind: 'move', move }) as Action);
}

function constructiveActions(state: GameState): Action[] {
  return [
    ...safeFoundationActions(state),
    ...revealingActions(state),
    ...wasteToTableauActions(state),
    ...exposureActions(state),
  ];
}

function usefulShuffleActions(state: GameState, existing: Action[]): Action[] {
  return shuffleCandidates(state, existing).filter(action => {
    const next = applyAction(state, action);
    if (!next) return false;
    return constructiveActions(next).length > 0;
  });
}

export function planNextAction(state: GameState, visited: ReadonlySet<string>): Action | null {
  if (state.won) return null;

  const currentKey = serializeState(state);
  const constructive = constructiveActions(state);
  const ordered: Action[] = [
    ...constructive,
    ...unsafeFoundationActions(state),
    { kind: 'draw' },
    ...usefulShuffleActions(state, constructive),
  ];

  for (const action of ordered) {
    const next = applyAction(state, action);
    if (!next) continue;
    const key = serializeState(next);
    if (key === currentKey) continue;
    if (visited.has(key)) continue;
    return action;
  }

  return null;
}

function productiveMoves(state: GameState): Move[] {
  return findLegalMoves(state).filter(m => m.sourceType !== 'foundation');
}

export function explainAction(state: GameState, action: Action): string {
  if (action.kind === 'draw') {
    return 'ストックをめくりましょう';
  }
  const m = action.move;
  let head: Card | undefined;
  if (m.sourceType === 'tableau') {
    const pile = state.tableau[m.sourceIndex];
    head = pile[pile.length - 1];
  } else if (m.sourceType === 'waste') {
    head = state.waste[state.waste.length - 1];
  } else {
    const f = state.foundations[m.sourceIndex];
    head = f[f.length - 1];
  }

  const dstLabel =
    m.targetType === 'foundation' ? '組札' : `場札 ${m.targetIndex + 1} 列目`;

  if (m.targetType === 'foundation') {
    if (head && isSafeFoundationSend(head, state.foundations, state.foundationSuits)) {
      return `${head.rank} を組札へ。安全な手です`;
    }
    return `${head?.rank ?? ''} を組札へ(後で受け皿に必要になるかも)`;
  }
  if (m.sourceType === 'foundation') {
    return '組札から引き戻して場の受け皿を確保します';
  }
  if (m.sourceType === 'waste') {
    return `${dstLabel}に置けます`;
  }
  if (m.sourceType === 'tableau') {
    const pile = state.tableau[m.sourceIndex];
    const run = faceUpRunLength(pile);
    if (pile.length > run) {
      return '移動すると裏のカードをめくれます';
    }
    return `${dstLabel}へ移動して盤面を整えます`;
  }
  return `${dstLabel}への移動です`;
}

export function isDeadlocked(state: GameState): boolean {
  if (state.won) return false;
  if (productiveMoves(state).length > 0) return false;

  let stock = [...state.stock];
  let waste = [...state.waste];
  const cycleLength = stock.length + waste.length;

  for (let n = 0; n < cycleLength; n++) {
    if (stock.length === 0) {
      stock = waste.slice().reverse().map(c => ({ ...c, faceUp: false }));
      waste = [];
    }
    const drawn = stock[stock.length - 1];
    stock = stock.slice(0, -1);
    waste = [...waste, { ...drawn, faceUp: true }];
    if (productiveMoves({ ...state, stock, waste }).length > 0) return false;
  }

  return true;
}

// ===== Complete solver =====
//
// draw-1 / unlimited-recycle ルールでは stock+waste は自由回転可能な循環集合であり、
// 並び順は解の存在に影響しない。そこで状態を「cycle(残カード集合) + foundations +
// tableau」に縮約してメモ化DFSで完全探索する。

export type PlanStep =
  | { kind: 'extract'; cardId: string; targetType: 'foundation' | 'tableau'; targetIndex: number }
  | { kind: 'move'; move: Move };

interface SolState {
  cycle: string[];
  order: string[];
  foundations: Card[][];
  tableau: Card[][];
}

const CARD_PROTOS = new Map<string, Card>(createDeck().map(c => [c.id, c]));
const CHAR_BY_ID = new Map<string, string>(
  createDeck().map((c, i) => [c.id, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[i]])
);

// draw-1 / unlimited-recycle における実際のドロー順:
//   stock[top→bottom] → waste[bottom→top] → (リサイクルで同一順を周回)
// よって循環の実順序は reverse(stock) ++ waste。order[0] が次にドローされるカード。
function toSolState(state: GameState): SolState {
  return {
    cycle: [...state.stock, ...state.waste].map(c => c.id).sort(),
    order: [...state.stock].reverse().map(c => c.id).concat(state.waste.map(c => c.id)),
    foundations: state.foundations.map(f => [...f]),
    tableau: state.tableau.map(p => [...p]),
  };
}

function isWonSol(s: SolState): boolean {
  return s.foundations.every(f => f.length === 13);
}

function foundationIndexOf(suit: Card['suit']): number {
  return FOUNDATION_SUITS.indexOf(suit);
}

function applyPlanStep(s: SolState, step: PlanStep): SolState | null {
  const foundations = s.foundations.map(f => [...f]);
  const tableau = s.tableau.map(p => [...p]);

  if (step.kind === 'extract') {
    if (!s.cycle.includes(step.cardId)) return null;
    const proto = CARD_PROTOS.get(step.cardId);
    if (!proto) return null;
    const live: Card = { ...proto, faceUp: true };
    if (step.targetType === 'foundation') {
      const f = foundations[step.targetIndex];
      if (!canPlaceOnFoundation(live, f, FOUNDATION_SUITS[step.targetIndex])) return null;
      foundations[step.targetIndex] = [...f, live];
    } else {
      const p = tableau[step.targetIndex];
      if (!canPlaceOnTableau(live, p)) return null;
      tableau[step.targetIndex] = [...p, live];
    }
    const oi = s.order.indexOf(step.cardId);
    if (oi < 0) return null;
    return {
      cycle: s.cycle.filter(id => id !== step.cardId),
      order: [...s.order.slice(oi + 1), ...s.order.slice(0, oi)],
      foundations,
      tableau,
    };
  }

  const m = step.move;
  if (m.sourceType === 'waste') return null;
  let moving: Card[];

  if (m.sourceType === 'foundation') {
    const f = foundations[m.sourceIndex];
    if (f.length === 0) return null;
    moving = [f[f.length - 1]];
    foundations[m.sourceIndex] = f.slice(0, -1);
  } else {
    const p = tableau[m.sourceIndex];
    if (p.length < m.cardCount || m.cardCount < 1) return null;
    const tail = p.slice(p.length - m.cardCount);
    if (tail.some(c => !c.faceUp)) return null;
    moving = tail;
    tableau[m.sourceIndex] = p.slice(0, p.length - m.cardCount);
  }

  const head = moving[0];
  if (m.targetType === 'foundation') {
    if (moving.length !== 1) return null;
    const f = foundations[m.targetIndex];
    if (!canPlaceOnFoundation(head, f, FOUNDATION_SUITS[m.targetIndex])) return null;
    foundations[m.targetIndex] = [...f, { ...head, faceUp: true }];
  } else {
    const p = tableau[m.targetIndex];
    if (!canPlaceOnTableau(head, p)) return null;
    tableau[m.targetIndex] = [...p, ...moving.map(c => ({ ...c, faceUp: true }))];
  }

  if (m.sourceType === 'tableau') {
    const sp = tableau[m.sourceIndex];
    if (sp.length > 0 && !sp[sp.length - 1].faceUp) {
      const last = sp[sp.length - 1];
      tableau[m.sourceIndex] = [...sp.slice(0, -1), { ...last, faceUp: true }];
    }
  }

  return { cycle: [...s.cycle], order: [...s.order], foundations, tableau };
}

function solCandidates(s: SolState): PlanStep[] {
  const safeF: Array<{ step: PlanStep; rank: number }> = [];
  const unsafeF: Array<{ step: PlanStep; rank: number }> = [];

  const pushFoundationStep = (step: PlanStep, card: Card) => {
    const entry = { step, rank: RANK_VALUES[card.rank] };
    if (isSafeFoundationSend(card, s.foundations, FOUNDATION_SUITS)) safeF.push(entry);
    else unsafeF.push(entry);
  };

  for (let i = 0; i < s.tableau.length; i++) {
    const pile = s.tableau[i];
    if (pile.length === 0) continue;
    const top = pile[pile.length - 1];
    if (!top.faceUp) continue;
    for (let f = 0; f < 4; f++) {
      if (canPlaceOnFoundation(top, s.foundations[f], FOUNDATION_SUITS[f])) {
        pushFoundationStep(
          { kind: 'move', move: { sourceType: 'tableau', sourceIndex: i, targetType: 'foundation', targetIndex: f, cardCount: 1 } },
          top
        );
      }
    }
  }

  for (const id of s.order) {
    const proto = CARD_PROTOS.get(id)!;
    const fi = foundationIndexOf(proto.suit);
    const live: Card = { ...proto, faceUp: true };
    if (canPlaceOnFoundation(live, s.foundations[fi], FOUNDATION_SUITS[fi])) {
      pushFoundationStep({ kind: 'extract', cardId: id, targetType: 'foundation', targetIndex: fi }, live);
    }
  }

  safeF.sort((a, b) => a.rank - b.rank);
  unsafeF.sort((a, b) => a.rank - b.rank);

  const steps: PlanStep[] = safeF.map(e => e.step);

  for (let i = 0; i < s.tableau.length; i++) {
    const pile = s.tableau[i];
    let run = 0;
    while (run < pile.length && pile[pile.length - 1 - run].faceUp) run++;
    if (run === 0 || pile.length <= run) continue;
    const head = pile[pile.length - run];
    for (let t = 0; t < s.tableau.length; t++) {
      if (t === i) continue;
      if (canPlaceOnTableau(head, s.tableau[t])) {
        steps.push({ kind: 'move', move: { sourceType: 'tableau', sourceIndex: i, targetType: 'tableau', targetIndex: t, cardCount: run } });
      }
    }
  }

  const kingExtracts: PlanStep[] = [];
  const otherExtracts: PlanStep[] = [];
  for (const id of s.order) {
    const proto = CARD_PROTOS.get(id)!;
    const live: Card = { ...proto, faceUp: true };
    for (let t = 0; t < s.tableau.length; t++) {
      if (!canPlaceOnTableau(live, s.tableau[t])) continue;
      const step: PlanStep = { kind: 'extract', cardId: id, targetType: 'tableau', targetIndex: t };
      if (s.tableau[t].length === 0 && proto.rank === 'K') kingExtracts.push(step);
      else otherExtracts.push(step);
    }
  }
  steps.push(...kingExtracts, ...otherExtracts);

  for (let i = 0; i < s.tableau.length; i++) {
    const pile = s.tableau[i];
    let run = 0;
    while (run < pile.length && pile[pile.length - 1 - run].faceUp) run++;
    for (let k = 1; k <= run; k++) {
      if (k === run && pile.length > run) continue;
      const head = pile[pile.length - k];
      for (let t = 0; t < s.tableau.length; t++) {
        if (t === i) continue;
        if (k === run && pile.length === run && s.tableau[t].length === 0) continue;
        if (canPlaceOnTableau(head, s.tableau[t])) {
          steps.push({ kind: 'move', move: { sourceType: 'tableau', sourceIndex: i, targetType: 'tableau', targetIndex: t, cardCount: k } });
        }
      }
    }
  }

  steps.push(...unsafeF.map(e => e.step));

  for (let f = 0; f < 4; f++) {
    const found = s.foundations[f];
    if (found.length === 0) continue;
    const top = found[found.length - 1];
    for (let t = 0; t < s.tableau.length; t++) {
      if (canPlaceOnTableau(top, s.tableau[t])) {
        steps.push({ kind: 'move', move: { sourceType: 'foundation', sourceIndex: f, targetType: 'tableau', targetIndex: t, cardCount: 1 } });
      }
    }
  }

  return steps;
}

function hashKey(s: SolState): number {
  let key = '';
  for (const id of s.cycle) key += CHAR_BY_ID.get(id);
  key += ';';
  for (const f of s.foundations) key += `${f.length},`;
  key += ';';
  for (const pile of s.tableau) {
    for (const c of pile) key += CHAR_BY_ID.get(c.id) + (c.faceUp ? '1' : '0');
    key += '|';
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    h1 = (h1 ^ ch) >>> 0;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (h2 + ch) >>> 0;
    h2 = Math.imul(h2, 2246822519) >>> 0;
  }
  return h1 * 2097152 + (h2 >>> 11);
}

export type SolverStatus = 'running' | 'won' | 'unsolvable' | 'budget';

export interface SolverHandle {
  step(maxNodesPerCall: number): { status: SolverStatus; nodes: number };
  getPlan(): PlanStep[] | null;
}

interface SolverFrame {
  state: SolState;
  key: number;
  cands: PlanStep[];
  idx: number;
}

function makeFrame(s: SolState): SolverFrame {
  return {
    state: s,
    key: hashKey(s),
    cands: solCandidates(s),
    idx: 0,
  };
}

export function createSolver(state: GameState, maxNodes: number = 250000): SolverHandle {
  const memo = new Map<number, number>();
  const IN_PROGRESS = 1;
  const LOST = 2;

  const stack: SolverFrame[] = [];
  const path: PlanStep[] = [];
  let nodes = 0;
  let finished: SolverStatus | null = null;
  let finalPlan: PlanStep[] | null = null;

  const start = toSolState(state);
  if (isWonSol(start)) {
    finished = 'won';
    finalPlan = [];
  } else {
    const startFrame = makeFrame(start);
    memo.set(startFrame.key, IN_PROGRESS);
    stack.push(startFrame);
  }

  function step(maxNodesPerCall: number): { status: SolverStatus; nodes: number } {
    if (finished) return { status: finished, nodes };

    const deadline = Math.min(nodes + maxNodesPerCall, maxNodes);
    while (stack.length > 0 && nodes < deadline) {
      const frame = stack[stack.length - 1];

      if (frame.idx >= frame.cands.length) {
        memo.set(frame.key, LOST);
        stack.pop();
        path.pop();
        continue;
      }

      const planStep = frame.cands[frame.idx++];
      const child = applyPlanStep(frame.state, planStep);
      if (!child) continue;

      if (isWonSol(child)) {
        finalPlan = [...path, planStep];
        finished = 'won';
        return { status: finished, nodes };
      }

      const childKey = hashKey(child);
      if (memo.has(childKey)) continue;

      nodes++;
      memo.set(childKey, IN_PROGRESS);
      stack.push(makeFrame(child));
      path.push(planStep);
    }

    if (stack.length === 0) {
      finished = 'unsolvable';
    } else if (nodes >= maxNodes) {
      finished = 'budget';
    }
    return { status: finished ?? 'running', nodes };
  }

  return {
    step,
    getPlan: () => finalPlan,
  };
}

export function solveSync(
  state: GameState,
  maxNodes: number = 250000
): { status: SolverStatus; plan: PlanStep[] | null; nodes: number } {
  const solver = createSolver(state, maxNodes);
  let result = solver.step(maxNodes);
  while (result.status === 'running') {
    result = solver.step(maxNodes);
  }
  return { status: result.status, plan: solver.getPlan(), nodes: result.nodes };
}

export interface DealtGame {
  state: GameState;
  attempts: number;
  proven: boolean;
}

export type DealDifficulty = 'easy' | 'normal' | 'hard';

interface DealParams {
  budget: number;
  candidates: number;
  strategy: 'fastest' | 'default' | 'hardest';
}

// 難易度は「完全ソルバが解到達までに要するノード数」を指標にする。
// - easy:   小予算で解ける配布だけ採用(確実に易しい)
// - normal: 従来どおり 40k ノードで証明できた配布を採用
// - hard:   複数候補を解き、ノード数最大(= 最も難しい)の証明済み配布を選ぶ
const DEAL_PARAMS: Record<DealDifficulty, DealParams> = {
  easy: { budget: 5000, candidates: 8, strategy: 'fastest' },
  normal: { budget: 40000, candidates: 1, strategy: 'default' },
  hard: { budget: 80000, candidates: 3, strategy: 'hardest' },
};

export function dealSolvableState(
  options: { difficulty?: DealDifficulty; rng?: () => number; seed?: number } = {}
): DealtGame {
  const { difficulty = 'normal', seed } = options;
  const params = DEAL_PARAMS[difficulty];
  const rng = options.rng ?? (seed !== undefined ? mulberry32(seed) : Math.random);

  let fallback: GameState | null = null;
  let last: GameState | null = null;
  let bestWon: { state: GameState; nodes: number } | null = null;

  for (let attempt = 1; attempt <= params.candidates; attempt++) {
    const state = dealCards(createDeck(), rng);
    last = state;
    const { status, nodes } = solveSync(state, params.budget);

    if (status === 'won') {
      if (params.strategy === 'fastest') {
        return { state, attempts: attempt, proven: true };
      }
      if (!bestWon || nodes > bestWon.nodes) bestWon = { state, nodes };
      if (params.strategy === 'hardest' && nodes >= params.budget * 0.75) break;
    } else if (status === 'budget' && !fallback) {
      fallback = state;
    }
  }

  if (bestWon) return { state: bestWon.state, attempts: params.candidates, proven: true };
  return { state: fallback ?? last!, attempts: params.candidates, proven: false };
}

// プラン内ループの削除。縮約モデル上で手順を事前シミュレートし、
// 同一盤面(ハッシュキー)への再訪が起きたら、再訪をまたぐ区間(往復ムーブ)を切り捨てる。
// 同一状態へ戻る手順なので勝利性は保たれ、ステップ数は単調に減少する。
export function compactPlan(state: GameState, plan: PlanStep[]): PlanStep[] {
  const kept: PlanStep[] = [];
  const seen = new Map<number, number>();
  let s = toSolState(state);
  seen.set(hashKey(s), 0);

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    const child = applyPlanStep(s, step);
    if (!child) {
      for (; i < plan.length; i++) kept.push(plan[i]);
      break;
    }
    const key = hashKey(child);
    const prev = seen.get(key);
    if (prev !== undefined && prev <= kept.length) {
      kept.length = prev;
      for (const [k2, v2] of seen) {
        if (v2 > prev) seen.delete(k2);
      }
      seen.set(key, prev);
    } else {
      seen.set(key, kept.length + 1);
      kept.push(step);
    }
    s = child;
  }

  return kept;
}

export function expandPlan(state: GameState, plan: PlanStep[]): Action[] {
  const actions: Action[] = [];
  let current = state;

  for (const step of plan) {
    if (step.kind === 'extract') {
      let guard = 0;
      for (;;) {
        const wasteTop = current.waste[current.waste.length - 1];
        if (wasteTop && wasteTop.id === step.cardId) break;
        if (current.stock.length === 0 && current.waste.length === 0) break;
        current = flipFromStock(current);
        actions.push({ kind: 'draw' });
        if (++guard > 128) break;
      }
      const move: Move = {
        sourceType: 'waste',
        sourceIndex: 0,
        targetType: step.targetType,
        targetIndex: step.targetIndex,
        cardCount: 1,
      };
      const next = moveCards(current, move.sourceType, move.sourceIndex, move.targetType, move.targetIndex, move.cardCount);
      if (!next) return actions;
      current = next;
      actions.push({ kind: 'move', move });
    } else {
      const m = step.move;
      const next = moveCards(current, m.sourceType, m.sourceIndex, m.targetType, m.targetIndex, m.cardCount);
      if (!next) return actions;
      current = next;
      actions.push({ kind: 'move', move: m });
    }
  }

  return actions;
}
