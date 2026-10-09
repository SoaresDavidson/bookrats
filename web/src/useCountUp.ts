import { useEffect, useRef, useState } from "react";

const ease = (t: number) => 1 - Math.pow(1 - t, 4);

export function useCountUp(target: number, opts: { animate: boolean; delay?: number; duration?: number }): number {
  const { animate, delay = 0, duration = 800 } = opts;
  const [val, setVal] = useState(animate ? 0 : target);
  const done = useRef(!animate);
  const cur = useRef(animate ? 0 : target);
  cur.current = val;
  useEffect(() => {
    if (!animate || done.current) return;
    const from = cur.current;
    const start = performance.now() + delay;
    let id = 0;
    const step = () => {
      const t = Math.min(1, Math.max(0, (performance.now() - start) / duration));
      if (t >= 1) {
        done.current = true;
        setVal(target);
        return;
      }
      setVal(from + (target - from) * ease(t));
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [animate, delay, duration, target]);
  return done.current || !animate ? target : val;
}
