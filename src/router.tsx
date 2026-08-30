import { useEffect, useState } from 'react';
import { getGame, listGames } from './games/registry';
import { parseHash } from './routes';
import type { Route } from './routes';
import { loadTheme, saveTheme, type Theme } from './stats';
import * as snd from './sound';

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

function useMenuTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const toggleTheme = () => {
    setTheme(t => {
      const next: Theme = t === 'green' ? 'dark' : 'green';
      saveTheme(next);
      return next;
    });
  };
  return { theme, toggleTheme };
}

export function MenuView(): React.ReactElement {
  const games = listGames();
  const { theme, toggleTheme } = useMenuTheme();

  // 日替わりの「ピックアップ」ゲーム(日にちで固定なので飽きずに回る)
  const dayIndex = Math.floor(Date.now() / 86400000);
  const featured = games.length > 0 ? games[dayIndex % games.length] : undefined;
  const [hoverId, setHoverId] = useState<string | null>(null);

  const onHover = (id: string | null) => {
    setHoverId(id);
    if (id) snd.playDraw();
  };

  return (
    <div className="menu-screen" data-theme={theme}>
      {/* 背景に浮かぶカード */}
      <div className="menu-bg" aria-hidden="true">
        {['♠', '♥', '♦', '♣', '★'].map((s, i) => (
          <span key={i} className={`menu-float menu-float-${i}`}>{s}</span>
        ))}
      </div>

      <header className="menu-header">
        <div className="menu-fan" aria-hidden="true">
          <span className="menu-fan-card menu-fan-1">K</span>
          <span className="menu-fan-card menu-fan-2">A</span>
          <span className="menu-fan-card menu-fan-3">7</span>
          <span className="menu-fan-card menu-fan-4">Q</span>
        </div>
        <h1 className="menu-title">Trick Card Games</h1>
        <p className="menu-tagline">
          さあ、<b>カードの世界</b>へ! どれから遊ぶ?
        </p>
        <button className="menu-theme-btn" onClick={toggleTheme} title="テーマ切替">
          🎨
        </button>
      </header>

      {featured && (
        <a className="menu-featured" href={`#/${featured.id}`} style={{ '--accent': featured.accent } as React.CSSProperties}>
          <span className="menu-featured-badge">今日のピックアップ</span>
          <span className="menu-featured-icon">{featured.icon}</span>
          <span className="menu-featured-info">
            <span className="menu-featured-name">{featured.name}</span>
            <span className="menu-featured-desc">{featured.description}</span>
            <span className="menu-featured-play">PLAY ▶</span>
          </span>
        </a>
      )}

      <div className="menu-grid">
        {games.map((g, i) => (
          <a
            key={g.id}
            className={`menu-card ${hoverId === g.id ? 'menu-card-hover' : ''}`}
            href={`#/${g.id}`}
            onMouseEnter={() => onHover(g.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(g.id)}
            onBlur={() => onHover(null)}
            style={{ '--i': i, '--accent': g.accent } as React.CSSProperties}
          >
            <span className="menu-card-top">
              <span className="menu-card-icon" style={{ '--accent': g.accent } as React.CSSProperties}>
                {g.icon ?? '🂠'}
              </span>
              <span className="menu-card-tag">
                {g.multiplayer ? 'CPU対戦' : '1人用'}
              </span>
            </span>
            <span className="menu-card-name">{g.name}</span>
            <span className="menu-card-desc">{g.description}</span>
            <span className="menu-card-foot">
              <span className="menu-card-players">
                {g.multiplayer ? `👥 ${g.minPlayers}〜${g.maxPlayers}人` : '🧍 ソロプレイ'}
              </span>
              <span className="menu-card-start">PLAY ▶</span>
            </span>
          </a>
        ))}
      </div>

      <footer className="menu-footer">
        全 {games.length} 種類のカードゲームを収録
      </footer>
    </div>
  );
}

export function Router(): React.ReactElement {
  const route = useRoute();
  if (route.kind === 'menu') {
    return <MenuView />;
  }
  const game = getGame(route.id)!;
  const GameView = game.view;
  return <GameView />;
}
