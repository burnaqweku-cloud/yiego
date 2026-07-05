import { useEffect, useRef, useState } from "react";

/**
 * Animate a number toward `target` with easeOutCubic — from 0 on first mount,
 * then from the currently-displayed value whenever it changes (so the balance
 * ticks smoothly after a purchase, even if a previous animation was mid-flight).
 * Honors prefers-reduced-motion.
 */
export function useCountUp(target: number, durationMs = 1000): number {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);
  const raf = useRef<number>();

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      valueRef.current = target;
      setValue(target);
      return;
    }

    const from = valueRef.current;
    const delta = target - from;
    if (delta === 0) {
      setValue(target);
      return;
    }

    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / durationMs, 1);
      const v = p < 1 ? from + delta * ease(p) : target;
      valueRef.current = v;
      setValue(v);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, durationMs]);

  return value;
}
