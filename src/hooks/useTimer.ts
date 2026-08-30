import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseTimerReturn {
  timer: number;
  timerRef: React.MutableRefObject<number>;
  isRunning: boolean;
  setIsRunning: (v: boolean) => void;
  resetTimer: () => void;
}

export function useTimer(gameWon: boolean, isGameOver: boolean, isDealing: boolean): UseTimerReturn {
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const timerRef = useRef(0);

  const resetTimer = useCallback(() => {
    timerRef.current = 0;
    setTimer(0);
  }, []);

  useEffect(() => {
    if (!isRunning || gameWon || isGameOver || isDealing) return;
    const interval = setInterval(() => {
      timerRef.current += 1;
      setTimer(timerRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, gameWon, isGameOver, isDealing]);

  return { timer, timerRef, isRunning, setIsRunning, resetTimer };
}
