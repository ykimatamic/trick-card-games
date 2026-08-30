import React, { useRef, useEffect, useState } from 'react';
import type { Card as CardType } from './types';
import { SUIT_COLORS, SUIT_SYMBOLS } from './types';

const SUIT_JP: Record<string, string> = {
  hearts: 'ハート',
  diamonds: 'ダイヤ',
  clubs: 'クラブ',
  spades: 'スペード',
};

interface CardProps {
  card: CardType;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
  className?: string;
  isDragging?: boolean;
  isHinted?: boolean;
}

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const Card: React.FC<CardProps> = ({
  card,
  onClick,
  onPointerDown,
  style,
  className = '',
  isDragging = false,
  isHinted = false,
}) => {
  const color = SUIT_COLORS[card.suit];
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const transitionName = `card-${card.id}`;
  const prevFaceUpRef = useRef(card.faceUp);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (card.faceUp && !prevFaceUpRef.current && !prefersReducedMotion()) {
      setFlipping(true);
    }
    prevFaceUpRef.current = card.faceUp;
  }, [card.faceUp]);

  const onFlipEnd = () => setFlipping(false);

  const suitName = SUIT_JP[card.suit] ?? card.suit;
  const faceLabel = card.faceUp ? '表向き' : '裏向き';
  const ariaLabel = `${suitName}の${card.rank}、${faceLabel}`;

  if (!card.faceUp) {
    return (
      <div
        className={`card card-back ${isHinted ? 'hinted' : ''} ${className}`}
        style={{ ...style, viewTransitionName: transitionName }}
        data-card-id={card.id}
        onPointerDown={onPointerDown}
        onClick={onClick}
        role="img"
        aria-label={ariaLabel}
      >
        <div className="card-back-pattern">
          <span>♠</span>
          <span>♣</span>
          <span>♥</span>
          <span>♦</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card card-face ${isDragging ? 'dragging' : ''} ${isHinted ? 'hinted' : ''} ${flipping ? 'card-flip' : ''} ${className}`}
      style={{ ...style, color, viewTransitionName: transitionName }}
      data-card-id={card.id}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onAnimationEnd={onFlipEnd}
      role="img"
      aria-label={ariaLabel}
    >
      <div className="card-corner card-top-left">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{suitSymbol}</span>
      </div>
      <div className="card-center">
        <span className="card-suit-large">{suitSymbol}</span>
      </div>
      <div className="card-corner card-bottom-right">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{suitSymbol}</span>
      </div>
    </div>
  );
};
