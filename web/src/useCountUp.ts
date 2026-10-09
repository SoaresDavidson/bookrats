import { useEffect, useRef, useState } from "react";

const easeOut = (power: number) => (t: number) => 1 - Math.pow(1 - t, power);

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Displayed value that counts toward `target`. The first run animates from 0 when `animate`
 * (with `delay`/`duration`); later target changes glide from the current value over `retarget` ms,
 * or jump immediately under reduced motion.
 */
export function useCountUp(
  target: number,
  opts: { animate: boolean; delay?: number; duration?: number; retarget?: number },
): { value: number; animating: boolean } {
  const { animate, delay = 0, duration = 800, retarget = 600 } = opts;
  const [val, setVal] = useState(animate ? 0 : target);
  const cur = useRef(val);
  const first = useRef(animate);
  const last = useRef<number | null>(null);
  cur.current = val;
  useEffect(() => {
    const isFirst = first.current && (last.current === null || last.current === target);
    if (!isFirst) first.current = false;
    last.current = target;
    if (cur.current === target) return;
    if (!isFirst && reducedMotion()) {
      setVal(target);
      return;
    }
    const from = cur.current;
    const d = isFirst ? duration : retarget;
    const ease = easeOut(isFirst ? 4 : 1.5);
    const start = performance.now() + (isFirst ? delay : 0);
    let id = 0;
    const step = () => {
      const t = Math.min(1, Math.max(0, (performance.now() - start) / d));
      if (t >= 1) {
        first.current = false;
        setVal(target);
        return;
      }
      setVal(from + (target - from) * ease(t));
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, delay, duration, retarget]);
  return { value: val, animating: val !== target };
}
