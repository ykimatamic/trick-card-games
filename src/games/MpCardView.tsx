import React from 'react';
import type { MpCard } from './cards';
import { colorOf, symbolOf, isJoker, cardLabel } from './cards';

interface MpCardViewProps {
  card: MpCard;
  faceUp?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
  ariaLabel?: string;
}

/**
 * 対戦ゲーム用のカード描画。ジョーカー対応。
 * 見た目はソリティアの .card と同等(独立した CSS で再現)。
 */
export const MpCardView: React.FC<MpCardViewProps> = ({
  card,
  faceUp = card.faceUp,
  onClick,
  disabled = false,
  small = false,
  ariaLabel,
}) => {
  const label = ariaLabel ?? (isJoker(card) ? 'ジョーカー' : cardLabel(card) + (faceUp ? '' : '(伏せ)'));
  const cls = ['mp-card', small ? 'mp-card-small' : ''].join(' ');
  const asButton = Boolean(onClick);

  const inner = faceUp ? (
    <>
      <div className="mp-card-corner mp-card-tl">
        <span className="mp-card-rank">{isJoker(card) ? '🃏' : card.rank}</span>
        <span className="mp-card-suit">{isJoker(card) ? '' : symbolOf(card)}</span>
      </div>
      <div className="mp-card-center" style={{ color: colorOf(card) }}>
        <span className="mp-card-suit-large">{symbolOf(card)}</span>
        {isJoker(card) && <span className="mp-joker-label">JOKER</span>}
      </div>
      <div className="mp-card-corner mp-card-br">
        <span className="mp-card-rank">{isJoker(card) ? '🃏' : card.rank}</span>
        <span className="mp-card-suit">{isJoker(card) ? '' : symbolOf(card)}</span>
      </div>
    </>
  ) : (
    <div className="mp-card-back-pattern">
      <span>♠</span><span>♣</span><span>♥</span><span>♦</span>
    </div>
  );

  if (asButton) {
    return (
      <button
        type="button"
        className={`${cls} ${faceUp ? 'mp-card-face' : 'mp-card-back'} ${disabled ? 'mp-card-disabled' : ''}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={`${cls} ${faceUp ? 'mp-card-face' : 'mp-card-back'}`}
      role="img"
      aria-label={label}
    >
      {inner}
    </div>
  );
};
