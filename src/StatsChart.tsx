import React, { useRef, useEffect } from 'react';
import type { GameRecord } from './stats';

interface StatsChartProps {
  history: GameRecord[];
}

export const StatsChart: React.FC<StatsChartProps> = ({ history }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, W, H);

    if (history.length === 0) {
      ctx.fillStyle = '#999';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('まだ対局記録がありません', W / 2, H / 2);
      return;
    }

    const recent = history.slice(-30);
    const barW = Math.max(4, Math.min(16, (W - 40) / recent.length - 2));
    const gap = 2;
    const totalW = recent.length * (barW + gap);
    const startX = (W - totalW) / 2;
    const chartTop = 20;
    const chartH = H - 40;

    ctx.fillStyle = '#666';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('直近の対局結果', startX, 14);

    recent.forEach((r, i) => {
      const x = startX + i * (barW + gap);
      const color = r.won ? '#27ae60' : '#e74c3c';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      const radius = Math.min(3, barW / 2);
      const barH = chartH * 0.6 + (chartH * 0.4 * Math.min(r.moves, 200)) / 200;
      const y = chartTop + chartH - barH;
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + barW, y, x + barW, y + barH, radius);
      ctx.arcTo(x + barW, y + barH, x, y + barH, radius);
      ctx.arcTo(x, y + barH, x, y, radius);
      ctx.arcTo(x, y, x + barW, y, radius);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    const wins = recent.filter(r => r.won).length;
    const rate = Math.round((wins / recent.length) * 100);
    ctx.fillStyle = '#444';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`勝率: ${rate}% (${wins}/${recent.length})`, startX + totalW, 14);
  }, [history]);

  return (
    <canvas
      ref={canvasRef}
      className="stats-chart"
      style={{ width: '100%', height: '120px', borderRadius: '8px', marginTop: '12px' }}
    />
  );
};
