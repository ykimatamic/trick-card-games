import React from 'react';
import { SUIT_COLORS, SUIT_SYMBOLS } from './types';
import { Card } from './Card';
import type { UseGameCoreReturn } from './hooks/useGameCore';
import type { UseHintsReturn } from './hooks/useHints';
import type { UseDragHandlerReturn } from './hooks/useDragHandler';

interface GameBoardProps {
  core: UseGameCoreReturn;
  hints: UseHintsReturn;
  drag: UseDragHandlerReturn;
  onStockClick: () => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  core, hints, drag, onStockClick,
}) => {
  return (
    <>
      <div className="top-area">
        <div className="stock-area">
          <div className="stock-pile" onClick={onStockClick}>
            {core.gameState.stock.length > 0 ? (
              <Card
                card={core.gameState.stock[core.gameState.stock.length - 1]}
                isHinted={hints.hintStock}
              />
            ) : (
              <div className="empty-pile stock-empty">
                <span>↻</span>
              </div>
            )}
          </div>

          <div className="waste-pile">
            {core.gameState.waste.length > 0 ? (
              core.gameState.waste.slice(-3).map((card, i, arr) => {
                const isTop = i === arr.length - 1;
                return (
                  <div
                    key={card.id}
                    className="waste-fan"
                    style={{
                      left: `calc(var(--card-w) * var(--waste-fan-gap) * ${i})`,
                      zIndex: i,
                    }}
                  >
                    <Card
                      card={card}
                      isHinted={hints.hintCardIds.has(card.id)}
                      isDragging={drag.dragSourceIds.has(card.id)}
                      onPointerDown={
                        isTop
                          ? (e) => drag.beginDrag(e, card, 'waste', 0)
                          : undefined
                      }
                    />
                  </div>
                );
              })
            ) : (
              <div className="empty-pile" />
            )}
          </div>
        </div>

        <div className="foundations-area">
          {core.gameState.foundations.map((foundation, i) => {
            const top = foundation[foundation.length - 1];
            return (
              <div
                key={i}
                className={`foundation-pile ${hints.hintPiles.has(`foundation-${i}`) ? 'hinted-pile' : ''}`}
                data-drop="foundation"
                data-index={i}
              >
                {top ? (
                  <Card
                    card={top}
                    isHinted={hints.hintCardIds.has(top.id)}
                    isDragging={drag.dragSourceIds.has(top.id)}
                    onPointerDown={(e) => drag.beginDrag(e, top, 'foundation', i)}
                  />
                ) : (
                  <div className="empty-pile foundation-empty">
                    <span>{SUIT_SYMBOLS[core.gameState.foundationSuits[i]]}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="tableau-area">
        {core.gameState.tableau.map((pile, pileIndex) => (
          <div
            key={pileIndex}
            className={`tableau-pile ${hints.hintPiles.has(`tableau-${pileIndex}`) ? 'hinted-pile' : ''}`}
            data-drop="tableau"
            data-index={pileIndex}
          >
            {pile.length === 0 ? (
              <div className="empty-pile tableau-empty" />
            ) : (
              pile.map((card, cardIndex) => (
                <div
                  key={card.id}
                  className="card-container"
                  style={{
                    top: `calc(var(--fan-offset) * ${cardIndex})`,
                    zIndex: cardIndex,
                  }}
                >
                  <Card
                    card={card}
                    isDragging={drag.dragSourceIds.has(card.id)}
                    isHinted={hints.hintCardIds.has(card.id)}
                    onPointerDown={
                      card.faceUp
                        ? (e) => drag.beginDrag(e, card, 'tableau', pileIndex)
                        : undefined
                    }
                  />
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      {drag.drag?.active && (
        <div
          className="drag-ghost"
          style={{ left: drag.drag.x - drag.drag.grabX, top: drag.drag.y - drag.drag.grabY }}
        >
          {drag.drag.cards.map((c, i) => (
            <div
              key={c.id}
              className="ghost-card"
              style={{
                top: `calc(var(--fan-offset) * ${i})`,
                color: SUIT_COLORS[c.suit],
              }}
            >
              <span className="ghost-corner">{c.rank}{SUIT_SYMBOLS[c.suit]}</span>
              <span className="ghost-center">{SUIT_SYMBOLS[c.suit]}</span>
            </div>
          ))}
        </div>
      )}

      {core.isDealing && (
        <div className="dealing-overlay">
          <div className="dealing-spinner" />
          <p>配布を生成中…</p>
        </div>
      )}
    </>
  );
};
