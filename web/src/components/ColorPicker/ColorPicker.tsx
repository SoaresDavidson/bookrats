import { useCallback, useEffect, useRef, useState } from "react";
import { setColor } from "../../api/client";
import type { ColorOption, Reader } from "../../api/types";

function cvars(c?: { light: string; dark: string }): React.CSSProperties | undefined {
  return c && { ["--c-light" as string]: c.light, ["--c-dark" as string]: c.dark, ["--mark" as string]: mark(c.light), ["--mark-dark" as string]: mark(c.dark) };
}

function mark(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#18181b" : "#ffffff";
}

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

  return (
    <>
        <div className="circles">
          <div className="circle-item" ref={wrapRef}>
            <button
              ref={mineRef}
              type="button"
              className="circle"
              style={cvars(mine?.color)}
              aria-label="Mudar minha cor"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            />
            <span className="circle-name">{mine?.name ?? "Você"}</span>
            {open && (
              <div className="popover" role="dialog" aria-label="Escolher cor">
                {palette.map((c) => {
                  const taken = !!other && other.color.light.toLowerCase() === c.light.toLowerCase();
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={taken ? "pick taken" : "pick"}
                      aria-label={LABELS[c.id] ?? c.id}
                      aria-pressed={mine?.color.id === c.id}
                      disabled={taken}
                      title={taken ? `Em uso por ${other!.name}` : undefined}
                      onClick={() => void pick(c.id)}
                    >
                      <span className="pick-dot" style={cvars(c)} />
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={mine?.color.id === "custom" ? "pick custom is-custom-active" : "pick custom"}
                  aria-label="Cor personalizada"
                  aria-pressed={mine?.color.id === "custom"}
                  onClick={() => colorRef.current?.click()}
                >
                  <span className="pick-dot" style={mine?.color.id === "custom" ? cvars(mine.color) : undefined} />
                </button>
                <input ref={colorRef} className="sr-only" type="color" aria-label="Escolher cor personalizada" tabIndex={-1} />
              </div>
            )}
          </div>
          {other && (
            <div className="circle-item">
              <span className="circle" style={cvars(other.color)} role="img" aria-label={`Cor de ${other.name}`} />
              <span className="circle-name">{other.name}</span>
            </div>
          )}
        </div>
        {colorErr && <p id="color-err" className="field-error" role="alert">{colorErr}</p>}
    </>
  );
}
