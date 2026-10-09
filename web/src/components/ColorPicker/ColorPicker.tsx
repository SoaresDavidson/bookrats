import { useCallback, useEffect, useRef, useState } from "react";
import { setColor } from "../../api/client";
import type { ColorOption, Reader } from "../../api/types";
import { ui } from "../../lib/ui";

function cvars(c?: { light: string; dark: string }): React.CSSProperties | undefined {
  return c && { ["--c-light" as string]: c.light, ["--c-dark" as string]: c.dark, ["--mark" as string]: mark(c.light), ["--mark-dark" as string]: mark(c.dark) };
}

function mark(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#18181b" : "#ffffff";
}

/** Neutral swatch colors while the reader has no color yet. */
const TRACK_VARS = { ["--c-light" as string]: "var(--track)", ["--c-dark" as string]: "var(--track)" } as React.CSSProperties;

const swatch = "bg-(--c-light) dark:bg-(--c-dark) shadow-swatch rounded-full";
const check =
  "after:content-[''] after:absolute after:left-[11px] after:top-[9px] after:w-3.5 after:h-[7px] after:border-b-[3px] after:border-l-[3px] after:border-(--mark) dark:after:border-(--mark-dark) after:-rotate-45";
const strike =
  "opacity-45 after:content-[''] after:absolute after:left-1/2 after:-top-0.5 after:-bottom-0.5 after:w-0.5 after:bg-ink after:rotate-45";
const wheel =
  "bg-(image:--gradient-wheel) shadow-swatch before:content-['+'] before:absolute before:inset-1 before:grid before:place-items-center before:rounded-full before:bg-surface before:text-ink before:font-bold before:text-[1.1rem] before:leading-none";

const LABELS: Record<string, string> = { azul: "Azul", laranja: "Laranja", verde: "Verde", roxo: "Roxo", rosa: "Rosa", ciano: "Ciano", ambar: "Âmbar", grafite: "Grafite" };

interface Props {
  token: string;
  mine?: Reader;
  other?: Reader;
  palette: ColorOption[];
  refresh: () => Promise<void>;
  guard: (e: unknown) => void;
}

export function ColorPicker({ token, mine, other, palette, refresh, guard }: Props) {
  const [colorErr, setColorErr] = useState("");
  const [open, setOpen] = useState(false);
  const mineRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    mineRef.current?.focus();
  }, []);

  const pick = async (id: string) => {
    setColorErr("");
    close();
    try {
      await setColor(token, id);
      await refresh();
    } catch (e) {
      if (e instanceof Error && (e as { status?: number }).status === 409) {
        setColorErr("Essa cor já está em uso");
        await refresh();
      } else guard(e);
    }
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(wrapRef.current?.querySelectorAll<HTMLButtonElement>(".popover button:not(:disabled)") ?? []);
    const first = items().find((b) => b.getAttribute("aria-pressed") === "true") ?? items()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i === list.length - 1 ? 0 : i + 1;
      e.preventDefault();
      list[next].focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (wrapRef.current?.contains(t)) return;
      if (t.closest?.("button, input, a, select, textarea, [tabindex]")) setOpen(false);
      else {
        setOpen(false);
        setTimeout(() => mineRef.current?.focus(), 0);
      }
    };
    const input = colorRef.current;
    const onChange = () => input && void pickRef.current(input.value);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    input?.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      input?.removeEventListener("change", onChange);
    };
  }, [open, close]);
  const storedHex = mine?.color.hex ?? mine?.color.light ?? "#2f6feb";
  useEffect(() => {
    if (open && colorRef.current) colorRef.current.value = storedHex;
  }, [open, storedHex]);

  const active = mine?.color.id === "custom";
  return (
    <>
        <div className="flex items-start">
          <div className="relative w-24 flex flex-col items-center gap-1.5 not-first:-ml-5" ref={wrapRef}>
            <button
              ref={mineRef}
              type="button"
              className={`block size-12 p-0 border-0 cursor-pointer ${swatch}`}
              style={cvars(mine?.color) ?? TRACK_VARS}
              aria-label="Mudar minha cor"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            />
            <span className="text-sm text-muted-strong max-w-24 truncate">{mine?.name ?? "Você"}</span>
            {open && (
              <div
                className="popover absolute z-5 top-[62px] left-[calc(50%-31px)] flex flex-wrap w-max max-w-[min(396px,calc(100vw-64px))] p-1.5 bg-surface border border-line rounded-card shadow-popover animate-pop-in motion-reduce:animate-none before:content-[''] before:absolute before:-top-[7px] before:left-[25px] before:size-3 before:bg-surface before:border-t before:border-l before:border-line before:rotate-45"
                role="dialog"
                aria-label="Escolher cor"
              >
                {palette.map((c) => {
                  const taken = !!other && other.color.light.toLowerCase() === c.light.toLowerCase();
                  const pressed = mine?.color.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`relative size-11 p-1 border-0 bg-transparent rounded-full ${taken ? "cursor-not-allowed" : "cursor-pointer"}`}
                      aria-label={LABELS[c.id] ?? c.id}
                      aria-pressed={pressed}
                      disabled={taken}
                      title={taken ? `Em uso por ${other!.name}` : undefined}
                      onClick={() => void pick(c.id)}
                    >
                      <span className={`block relative size-9 ${swatch} ${pressed ? check : ""} ${taken ? strike : ""}`} style={cvars(c)} />
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`relative size-11 p-1 border-0 bg-transparent rounded-full cursor-pointer${active ? " is-custom-active" : ""}`}
                  aria-label="Cor personalizada"
                  aria-pressed={active}
                  onClick={() => colorRef.current?.click()}
                >
                  <span
                    className={`block relative size-9 rounded-full ${active ? `bg-(--c-light) dark:bg-(--c-dark) shadow-swatch ${check}` : wheel}`}
                    style={active && mine ? cvars(mine.color) : undefined}
                  />
                </button>
                <input ref={colorRef} className="sr-only" type="color" aria-label="Escolher cor personalizada" tabIndex={-1} />
              </div>
            )}
          </div>
          {other && (
            <div className="relative w-24 flex flex-col items-center gap-1.5 not-first:-ml-5">
              <span className={`block size-12 ${swatch}`} style={cvars(other.color)} role="img" aria-label={`Cor de ${other.name}`} />
              <span className="text-sm text-muted-strong max-w-24 truncate">{other.name}</span>
            </div>
          )}
        </div>
        {colorErr && <p id="color-err" className={ui.fieldError} role="alert">{colorErr}</p>}
    </>
  );
}
