import { useCallback, useState } from 'react';
import { loadTheme, saveTheme, type Theme } from '../stats';
import * as snd from '../sound';

export interface MpChrome {
  theme: Theme;
  soundOn: boolean;
  toggleTheme: () => void;
  toggleSound: () => void;
}

/** 対戦ゲーム共通の表示設定(テーマ・サウンド)。ソリティアと設定を共有する */
export function useMpChrome(): MpChrome {
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [soundOn, setSoundOn] = useState<boolean>(() => !snd.isMuted());

  const toggleTheme = useCallback(() => {
    setTheme(t => {
      const next: Theme = t === 'green' ? 'dark' : 'green';
      saveTheme(next);
      return next;
    });
  }, []);

  const toggleSound = useCallback(() => {
    const cur = snd.isMuted();
    snd.setMuted(!cur);
    setSoundOn(!snd.isMuted());
  }, []);

  return { theme, soundOn, toggleTheme, toggleSound };
}

/** 結果ランキングのメダル。1〜3位はメダル、以降は順位数字 */
export function rankMedal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}位`;
}