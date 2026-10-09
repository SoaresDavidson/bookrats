import { useEffect, useRef, type ReactNode, type Ref } from "react";

interface Props {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional handle on the dialog element (for focusing inner controls). */
  ref?: Ref<HTMLDivElement>;
}

/** Modal sheet: focus on open, restore on close, Escape closes, Tab is trapped, scrim click closes. */
export function Dialog({ labelledBy, onClose, children, ref: outer }: Props) {
  const inner = useRef<HTMLDivElement | null>(null);
  const setRef = (el: HTMLDivElement | null) => {
    inner.current = el;
    if (typeof outer === "function") outer(el);
    else if (outer) (outer as { current: HTMLDivElement | null }).current = el;
  };

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    inner.current?.focus();
    return () => prev?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const root = inner.current;
      if (e.key !== "Tab" || !root) return;
      const els = [...root.querySelectorAll<HTMLElement>("button, input")].filter((x) => !(x as HTMLButtonElement).disabled);
      if (!els.length) return;
      const act = document.activeElement;
      const first = els[0];
      const last = els[els.length - 1];
      if (!root.contains(act) || (e.shiftKey && (act === first || act === root))) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && act === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={setRef} className="sheet card stack" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
