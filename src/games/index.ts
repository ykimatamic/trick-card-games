import { registerGame } from './registry';
import { Board } from '../Board';
import { OldMaidView } from './OldMaidView';
import { SevensView } from './SevensView';
import { DaifugoView } from './DaifugoView';
import { MemoryView } from './MemoryView';
import { BlackjackView } from './BlackjackView';
import { CheatView } from './CheatView';
import { PokerView } from './PokerView';

/**
 * 全ゲームをレジストリへ登録する。
 * App 起動時にこのモジュールを import することで選択メニューから起動できるようになる。
 */
export function registerAllGames(): void {
  registerGame({
    id: 'solitaire',
    name: 'ソリティア',
    description: 'Klondike ルールの1人用カードパズル。山札からカードを場に並べ、基本の4山を完成させます。',
    multiplayer: false,
    minPlayers: 1,
    maxPlayers: 1,
    icon: '🧩',
    accent: '#27ae60',
    view: Board,
  });

  registerGame({
    id: 'old-maid',
    name: 'ババ抜き',
    description: 'ジョーカーを最後まで持っている人が負け。CPUとカードを引き合い、同じ数字のペアを捨てていきます。',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 6,
    defaultPlayers: 3,
    icon: '🃏',
    accent: '#e74c3c',
    view: OldMaidView,
  });

  registerGame({
    id: 'sevens',
    name: '7並べ',
    description: '各スートの7を起点に、前後へ数字をつないでカードを出していきます。最初に手札を出し切った人が勝ち。',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 7,
    defaultPlayers: 3,
    icon: '🂡',
    accent: '#2980b9',
    view: SevensView,
  });

  registerGame({
    id: 'daifugo',
    name: '大富豪',
    description: '数字の大小で出し合い、最初に手札をなくした人が大富豪。革命・8切り・10捨て・カード交換付きの大人数戦。',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 6,
    defaultPlayers: 4,
    icon: '👑',
    accent: '#f39c12',
    view: DaifugoView,
  });

  registerGame({
    id: 'memory',
    name: '神経衰弱',
    description: '場のカードを2枚ずつめくり、同じ数字のペアを探して集める記憶力ゲーム。CPUはめくったカードを覚えています。',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 4,
    defaultPlayers: 2,
    icon: '🧠',
    accent: '#8e44ad',
    view: MemoryView,
  });

  registerGame({
    id: 'blackjack',
    name: 'ブラックジャック',
    description: 'ディーラーとの点数の取り合い。21を超えずにディーラーより大きければ勝ち。チップを賭けてヒット/スタンド/ダブル。',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    icon: '♠️',
    accent: '#c0392b',
    view: BlackjackView,
  });

  registerGame({
    id: 'cheat',
    name: 'ダウト',
    description: '手札を伏せて「宣言したランク」として出していく心理戦。ウソを見破って「ダウト！」を宣言しよう。',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 6,
    defaultPlayers: 3,
    icon: '🎭',
    accent: '#16a085',
    view: CheatView,
  });

  registerGame({
    id: 'poker',
    name: 'ポーカー(5カードドロー)',
    description: '5枚の手札で役を競う定番ポーカー。ベット→交換→ベット→ショウダウン。レイズでプレッシャーをかけよう。',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 6,
    defaultPlayers: 3,
    icon: '♦️',
    accent: '#d35400',
    view: PokerView,
  });
}
