import { useState, useCallback, useEffect } from 'react';
import type { GameState, Card as CardType, MoveEntry } from '../types';
import { moveCards, autoMoveSafeToFoundation } from '../game';
import * as snd from '../sound';

type DragSourceType = 'tableau' | 'waste' | 'foundation';

interface DragInfo {
  sourceType: DragSourceType;
  sourceIndex: number;
  cardCount: number;
  cards: CardType[];
}

export interface DragState extends DragInfo {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  active: boolean;
}

const DRAG_THRESHOLD_PX = 6;

export interface UseDragHandlerReturn {
  drag: DragState | null;
  dragSourceIds: Set<string>;
  beginDrag: (
    e: React.PointerEvent<HTMLDivElement>,
    card: CardType,
    sourceType: DragSourceType,
    sourceIndex: number
  ) => void;
}

export function useDragHandler(opts: {
  phase: string;
  isDealing: boolean;
  gameStateRef: React.MutableRefObject<GameState>;
  commit: (next: GameState, animate?: boolean, record?: boolean) => void;
  clearHints: () => void;
  setAutoStatus: (v: string | null) => void;
  logMove: (entry: MoveEntry) => void;
}): UseDragHandlerReturn {
  const { phase, isDealing, gameStateRef, commit, clearHints, setAutoStatus, logMove } = opts;
  const [drag, setDrag] = useState<DragState | null>(null);

  const performMove = useCallback((
    info: DragInfo,
    targetType: 'tableau' | 'foundation',
    targetIndex: number
  ): boolean => {
    const result = moveCards(
      gameStateRef.current,
      info.sourceType,
      info.sourceIndex,
      targetType,
      targetIndex,
      info.cardCount
    );
    if (!result) return false;
    clearHints();
    setAutoStatus(null);
    if (targetType === 'foundation') snd.playFoundation(targetIndex);
    else snd.playPlace();
    logMove({ t: 'm', src: info.sourceType, si: info.sourceIndex, dst: targetType, di: targetIndex, n: info.cardCount });
    commit(autoMoveSafeToFoundation(result));
    return true;
  }, [commit, clearHints, setAutoStatus, gameStateRef, logMove]);

  const trySendTopToFoundation = useCallback((
    sourceType: 'tableau' | 'waste',
    sourceIndex: number
  ): number => {
    const prev = gameStateRef.current;
    for (let f = 0; f < prev.foundations.length; f++) {
      const result = moveCards(prev, sourceType, sourceIndex, 'foundation', f, 1);
      if (result) {
        clearHints();
        setAutoStatus(null);
        snd.playFoundation(f);
        logMove({ t: 'm', src: sourceType, si: sourceIndex, dst: 'foundation', di: f, n: 1 });
        commit(autoMoveSafeToFoundation(result));
        return f;
      }
    }
    return -1;
  }, [commit, clearHints, setAutoStatus, gameStateRef, logMove]);

  const beginDrag = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    card: CardType,
    sourceType: DragSourceType,
    sourceIndex: number
  ) => {
    if (phase !== 'idle' || isDealing) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!card.faceUp) return;

    const gs = gameStateRef.current;
    let cards: CardType[];
    let count: number;

    if (sourceType === 'tableau') {
      const pile = gs.tableau[sourceIndex];
      const i = pile.findIndex(c => c.id === card.id);
      if (i < 0) return;
      count = pile.length - i;
      cards = pile.slice(i);
      if (cards.some(c => !c.faceUp)) return;
    } else if (sourceType === 'waste') {
      const top = gs.waste[gs.waste.length - 1];
      if (!top || top.id !== card.id) return;
      count = 1;
      cards = [top];
    } else {
      const foundation = gs.foundations[sourceIndex];
      const top = foundation[foundation.length - 1];
      if (!top || top.id !== card.id) return;
      count = 1;
      cards = [top];
    }

    const rect = e.currentTarget.getBoundingClientRect();
    clearHints();
    setDrag({
      sourceType,
      sourceIndex,
      cardCount: count,
      cards,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      active: false,
    });
  }, [phase, isDealing, clearHints, gameStateRef]);

  useEffect(() => {
    if (!drag) return;
    const snapshot = drag;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== snapshot.pointerId) return;
      setDrag(d => {
        if (!d) return d;
        const active =
          d.active ||
          Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD_PX;
        return { ...d, x: e.clientX, y: e.clientY, active };
      });
    };

    const resolveDrop = (d: DragState): boolean => {
      const el = document.elementFromPoint(d.x, d.y);
      const holder = el ? (el.closest('[data-drop]') as HTMLElement | null) : null;
      if (!holder) return false;
      const type = holder.dataset.drop as 'tableau' | 'foundation' | undefined;
      if (type !== 'tableau' && type !== 'foundation') return false;
      const idx = Number(holder.dataset.index);
      if (Number.isNaN(idx)) return false;
      return performMove(d, type, idx);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== snapshot.pointerId) return;
      setDrag(null);
      if (snapshot.active) {
        if (!resolveDrop(snapshot)) snd.playError();
        return;
      }
      if (snapshot.sourceType === 'tableau' && snapshot.cardCount === 1) {
        if (trySendTopToFoundation('tableau', snapshot.sourceIndex) < 0) snd.playError();
      } else if (snapshot.sourceType === 'waste') {
        if (trySendTopToFoundation('waste', 0) < 0) snd.playError();
      }
    };

    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== snapshot.pointerId) return;
      setDrag(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [drag, performMove, trySendTopToFoundation]);

  const dragSourceIds = new Set<string>(
    drag && drag.active ? drag.cards.map(c => c.id) : []
  );

  return { drag, dragSourceIds, beginDrag };
}
