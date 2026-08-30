import type { ComponentType } from 'react';

/**
 * カードゲームスイート用のゲーム登録情報。
 *
 * 各ゲームはこの情報を registry に登録することで、トップの選択メニューや
 * ルーティングから起動できるようになる。
 *
 * 現時点では「メタ情報 + 描画コンポーネント」のみを持つ軽量な定義としている。
 * ルール層 / AI層の汎用コントラクト(applyAction / legalActions 等)は、
 * 対戦ゲーム(ババ抜き等)を追加する段階で導入する。
 */
export interface GameMeta {
  /** URL パス等で使う一意キー(e.g. 'solitaire', 'old-maid') */
  id: string;
  /** 表示名(e.g. 'ソリティア') */
  name: string;
  /** 選択メニューに表示する短い説明 */
  description: string;
  /** 対戦ゲームか(1人用ソリティアは false) */
  multiplayer: boolean;
  /** 最小・最大プレイヤー数(1人用は 1/1) */
  minPlayers: number;
  /** 最小・最大プレイヤー数(1人用は 1/1) */
  maxPlayers: number;
  /** ルーティング時の描画コンポーネント */
  view: ComponentType;
  /** 将来用: ゲーム別の設定デフォルト */
  defaultPlayers?: number;
  /** メニューカードに表示するアイコン(絵文字) */
  icon?: string;
  /** メニューカードのアクセント色(CSS色指定、省略時はデフォルト) */
  accent?: string;
}

const gameRegistry = new Map<string, GameMeta>();

export function registerGame(meta: GameMeta): void {
  if (gameRegistry.has(meta.id)) {
    throw new Error(`Game already registered: ${meta.id}`);
  }
  gameRegistry.set(meta.id, meta);
}

export function getGame(id: string): GameMeta | undefined {
  return gameRegistry.get(id);
}

export function listGames(): GameMeta[] {
  return [...gameRegistry.values()];
}
