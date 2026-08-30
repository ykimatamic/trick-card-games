import { useCallback, useEffect, useRef, useState } from 'react';
import { recordResult } from './gameStats';

/**
 * 対戦型カードゲーム(ババ抜き / 7並べ / 大富豪)の共通コントラクト。
 *
 * 各ゲームはこの TurnGameDef を実装し、useTurnHost フックに渡すことで
 * 「人間 + CPU」のターン進行・CPU自動操作・終了判定が共通で動くようになる。
 *
 * 型パラメータ:
 *   S ... ゲーム状態(盤面全体。手札等の非公開情報も含む)
 *   A ... アクション(着手)
 */
export interface TurnGameDef<S, A> {
  /** ゲームのID(ログ/デバッグ用) */
  id: string;
  /** 人数で初期状態を生成する。context はゲーム別オプション(前回順位・シード・ルール等) */
  setup(playerCount: number, rng: () => number, context?: unknown): S;
  /** 現在のターンのプレイヤー番号。終了時は null */
  currentPlayer(state: S): number | null;
  /** 指定プレイヤーの合法着手一覧 */
  legalActions(state: S, playerId: number): A[];
  /** 着手を適用する。不正なら null */
  apply(state: S, playerId: number, action: A): S | null;
  /** 終了判定 */
  isFinished(state: S): boolean;
  /** 結果(プレイヤー番号を順位順に)。終了していないなら null */
  results(state: S): { playerId: number; rank: number; isLoser: boolean }[] | null;
  /** CPU の着手選択。null ならパス等の無し扱い */
  chooseCpuAction(state: S, playerId: number): A | null;
}

export interface TurnPlayer {
  id: number;
  name: string;
  isHuman: boolean;
}

export interface TurnHostState<S, A> {
  gameState: S | null;
  players: TurnPlayer[];
  currentPlayer: number | null;
  finished: boolean;
  results: { playerId: number; rank: number; isLoser: boolean }[] | null;
  status: string;
  /** 人間プレイヤーによる着手(人間のターンのみ有効) */
  play: (action: A) => boolean;
  /** 新しい対局を開始する。context はゲーム別オプション(前回順位等) */
  start: (playerCount: number, humanName?: string, context?: unknown) => void;
}

export interface UseTurnHostOptions<S, A> {
  /** CPU考慮の遅延(ms) */
  cpuDelayMs?: number;
  /** 人間プレイヤー番号(通常 0) */
  humanPlayerId?: number;
  rng?: () => number;
  /** 着手が適用された直後に呼ばれる(サウンド等のUI演出用) */
  onApply?: (prev: S, next: S, action: A, playerId: number) => void;
}

/**
 * ターン進行を駆動する共通フック。
 * - 現在のプレイヤーが CPU なら自然な間隔で自動着手
 * - 人間のターンは play() から着手を受理
 * - 終了判定・結果の保持
 */
export function useTurnHost<S, A>(
  def: TurnGameDef<S, A>,
  options: UseTurnHostOptions<S, A> = {}
): TurnHostState<S, A> {
  const { cpuDelayMs = 900, humanPlayerId = 0 } = options;
  const [gameState, setGameState] = useState<S | null>(null);
  const [players, setPlayers] = useState<TurnPlayer[]>([]);
  const [status, setStatus] = useState('');

  const defRef = useRef(def);
  defRef.current = def;
  const optsRef = useRef(options);
  optsRef.current = options;
  const gameStateRef = useRef<typeof gameState>(null);
  gameStateRef.current = gameState;

  const currentPlayer = gameState ? def.currentPlayer(gameState) : null;
  const finished = gameState ? def.isFinished(gameState) : false;
  const results = finished && gameState ? def.results(gameState) : null;

  const start = useCallback((playerCount: number, humanName?: string, context?: unknown) => {
    const rng = optsRef.current.rng ?? Math.random;
    const s = defRef.current.setup(playerCount, rng, context);
    const ps: TurnPlayer[] = Array.from({ length: playerCount }, (_, i) => ({
      id: i,
      name: i === optsRef.current.humanPlayerId && humanName ? humanName : `CPU${i + 1}`,
      isHuman: i === optsRef.current.humanPlayerId,
    }));
    setGameState(s);
    setPlayers(ps);
    setStatus('');
  }, []);

  const applyAction = useCallback((playerId: number, action: A): boolean => {
    const prev = gameStateRef.current;
    if (!prev) return false;
    const next = defRef.current.apply(prev, playerId, action);
    if (!next) return false;
    // 終了着手であれば対象ゲームの戦績(勝敗)を記録する
    if (defRef.current.isFinished(next)) {
      const rs = defRef.current.results(next);
      const human = rs?.find(r => r.playerId === optsRef.current.humanPlayerId);
      if (human) {
        recordResult(defRef.current.id, human.rank === 1);
      }
    }
    gameStateRef.current = next;
    optsRef.current.onApply?.(prev, next, action, playerId);
    setGameState(next);
    return true;
  }, []);

  const play = useCallback(
    (action: A): boolean => {
      const cp = gameStateRef.current ? defRef.current.currentPlayer(gameStateRef.current) : null;
      if (cp === null || cp !== humanPlayerId) return false;
      return applyAction(humanPlayerId, action);
    },
    [applyAction, humanPlayerId]
  );

  // CPU 自動着手(自ターンで delay 後に実行)
  useEffect(() => {
    if (!gameState) return;
    const d = defRef.current;
    const cp = d.currentPlayer(gameState);
    if (cp === null || finished) return;
    const isHuman = cp === humanPlayerId;
    if (isHuman) return;

    const action = d.chooseCpuAction(gameState, cp);
    if (action === null) {
      setStatus('CPUが選択できる手がありません');
      return;
    }
    const handle = setTimeout(() => {
      applyAction(cp, action);
    }, cpuDelayMs);
    return () => clearTimeout(handle);
  }, [gameState, finished, humanPlayerId, cpuDelayMs, applyAction]);

  return {
    gameState,
    players,
    currentPlayer,
    finished,
    results,
    status,
    play,
    start,
  };
}
