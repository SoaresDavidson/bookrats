import { useCallback, useEffect, useRef, useState } from "react";
import type { Reader } from "../../api/types";
import { useCountUp } from "../../hooks/useCountUp";
import { ago, pct } from "../../lib/format";
import { readerVars } from "../../lib/readerVars";
import { ui } from "../../lib/ui";

function points(s: { from: number; to: number }): string {
  const a = Math.round(s.from * 100);
  const b = Math.round(s.to * 100);
  const d = b - a;
  const n = Math.abs(d);
  return `${d > 0 ? "+" : d < 0 ? "-" : ""}${n} ${n === 1 ? "ponto" : "pontos"} (${a}% → ${b}%)`;
}

function lastLine(r: Reader) {
  if (!r.last_session) return "Sem sessões ainda";
  return (
    <>
      <span className="whitespace-nowrap">Última sessão {ago(r.updated_at)}</span>
      {" · "}
      <span className="whitespace-nowrap">{points(r.last_session)}</span>
    </>
  );
}

export function ReaderBar({ r, i, animate }: { r: Reader; i: number; animate: boolean }) {
  const v = r.percentage === null ? 0 : Math.round(r.percentage * 100);
  const { value: shown, animating } = useCountUp(v, { animate, delay: i * 120, duration: 800 });
  const [advanced, setAdvanced] = useState(false);
  const prev = useRef(v);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const raf = useRef<number[]>([]);
  const isOn = useRef(false);
  const cancelRaf = useCallback(() => {
    for (const id of raf.current) cancelAnimationFrame(id);
    raf.current = [];
  }, []);
  useEffect(() => {
    if (v > prev.current) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        isOn.current = false;
        setAdvanced(false);
      }, 1600);
      cancelRaf();
      if (isOn.current) {
        // Restart the CSS animations: drop the class for two frames, then re-add it.
        setAdvanced(false);
        const a = requestAnimationFrame(() => {
          const b = requestAnimationFrame(() => setAdvanced(true));
          raf.current.push(b);
        });
        raf.current.push(a);
      } else {
        isOn.current = true;
        setAdvanced(true);
      }
    }
    prev.current = v;
  }, [v, cancelRaf]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      cancelRaf();
    },
    [cancelRaf],
  );
  const text = shown === v ? pct(r.percentage) : `${Math.round(shown)}%`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className={ui.readerTop}>
        <span className={ui.name}>
          <span className={ui.dot} style={readerVars(r, i)} />
          {r.name}
        </span>
        <span className={ui.pct} data-testid={`pct-${r.name}`}>
          {text}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-track">
        <div
          className={`bar-fill relative overflow-hidden h-full w-full origin-left rounded-full transition-transform duration-600 ease-soft motion-reduce:transition-none bg-(--c-light) dark:bg-(--c-dark)${animating ? " is-animating" : ""}${advanced ? " is-advanced" : ""}`}
          role="progressbar"
          aria-label={r.name}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={v}
          data-reader={r.name}
          style={{ transform: `scaleX(${shown / 100})`, transformOrigin: "left", ...readerVars(r, i) }}
        />
      </div>
      <p className={ui.muted}>{lastLine(r)}</p>
    </div>
  );
}
