import React, { useEffect, useRef } from 'react';
import type { Rank, Suit } from './types';
import { RANKS, SUIT_COLORS, SUIT_SYMBOLS } from './types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  suit: Suit;
  rank: Rank;
}

const SUIT_ORDER: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  p: Particle,
  cw: number,
  ch: number
) {
  ctx.save();
  ctx.translate(p.x, p.y);
  roundRectPath(ctx, 0, 0, cw, ch, cw * 0.08);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#999999';
  ctx.stroke();
  ctx.fillStyle = SUIT_COLORS[p.suit];
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${Math.round(cw * 0.2)}px sans-serif`;
  ctx.fillText(p.rank, 5, 4);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(cw * 0.42)}px sans-serif`;
  ctx.fillText(SUIT_SYMBOLS[p.suit], cw / 2, ch * 0.58);
  ctx.restore();
}

export const WinCascade: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const origins: Array<{ x: number; y: number; w: number; h: number }> = [];
    document.querySelectorAll<HTMLElement>('.foundation-pile').forEach(el => {
      const r = el.getBoundingClientRect();
      origins.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    });
    const base = origins[0];
    const cw = base ? base.w : 80;
    const ch = base ? base.h : 112;
    const originAt = (i: number) =>
      origins[i] ?? { x: W - (4 - i) * (cw + 12), y: 24, w: cw, h: ch };

    const queue: Array<{ suit: Suit; rank: Rank }> = [];
    for (let r = RANKS.length - 1; r >= 0; r--) {
      for (let s = 0; s < 4; s++) {
        queue.push({ suit: SUIT_ORDER[s], rank: RANKS[r] });
      }
    }

    const parts: Particle[] = [];
    let qi = 0;
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let alive = true;

    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(now - last, 50);
      last = now;
      acc += dt;

      while (acc >= 70 && qi < queue.length) {
        acc -= 70;
        const pileIdx = qi % 4;
        qi++;
        const o = originAt(pileIdx);
        const card = queue[qi - 1];
        parts.push({
          x: o.x,
          y: o.y,
          vx: (Math.random() * 3.5 + 2) * (Math.random() < 0.5 ? -1 : 1),
          vy: -(Math.random() * 3),
          suit: card.suit,
          rank: card.rank,
        });
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += 0.5 * (dt / 16.7);
        p.x += p.vx * (dt / 16.7);
        p.y += p.vy * (dt / 16.7);
        if (p.y + ch > H) {
          p.y = H - ch;
          p.vy *= -0.78;
          if (Math.abs(p.vy) < 0.8) p.vy = -(Math.random() * 2 + 1.5);
        }
        if (p.x < -cw - 40 || p.x > W + 40) {
          parts.splice(i, 1);
          continue;
        }
        drawParticle(ctx, p, cw, ch);
      }

      if (qi >= queue.length && parts.length === 0) return;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="win-cascade" />;
};
