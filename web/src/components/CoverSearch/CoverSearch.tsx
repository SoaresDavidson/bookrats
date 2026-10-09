import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AuthError, searchCovers } from "../../api/client";
import type { CoverOption, CoverSearchResult } from "../../api/types";
import { ui } from "../../lib/ui";
import { Cover } from "../Cover/Cover";
import { Dialog } from "../Dialog/Dialog";

const SOURCE: Record<CoverOption["source"], string> = { openlibrary: "Open Library", google: "Google Books" };

const label = (c: CoverOption) =>
  `Usar capa: ${[c.title, c.author].filter(Boolean).join(", ") || "sem título"} (${SOURCE[c.source]})`;

interface Props {
  token: string;
  title: string;
  author?: string | null;
  onPick: (url: string) => void;
  onClose: () => void;
  onAuthError?: () => void;
}

type State = { kind: "loading" } | ({ kind: "done" } & CoverSearchResult) | { kind: "error" };

/** Modal that searches Open Library and Google Books and lets the reader pick one of the covers found. */
export function CoverSearch({ token, title, author, onPick, onClose, onAuthError }: Props) {
  const [q, setQ] = useState({ title, author: author ?? "" });
  const [state, setState] = useState<State>({ kind: "loading" });
  const seq = useRef(0);

  const search = useCallback(
    async (t: string, a: string) => {
      const id = ++seq.current;
      setState({ kind: "loading" });
      try {
        const found = await searchCovers(token, t.trim(), a.trim() || undefined);
        if (id === seq.current) setState({ kind: "done", ...found });
      } catch (e) {
        if (id !== seq.current) return;
        if (e instanceof AuthError) onAuthError?.();
        setState({ kind: "error" });
      }
    },
    [token, onAuthError],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: search once with the reading's own title on open
  useEffect(() => {
    void search(title, author ?? "");
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.title.trim()) void search(q.title, q.author);
  };

  return (
    <Dialog labelledBy="cover-search-title" onClose={onClose}>
      <h2 id="cover-search-title" className={ui.sub}>
        Buscar capa
      </h2>
      <form className={ui.stack} onSubmit={submit}>
        <label className={ui.field}>
          <span>Título</span>
          <input
            className={ui.input}
            value={q.title}
            onChange={(e) => setQ((v) => ({ ...v, title: e.target.value }))}
          />
        </label>
        <label className={ui.field}>
          <span>Autor</span>
          <input
            className={ui.input}
            value={q.author}
            onChange={(e) => setQ((v) => ({ ...v, author: e.target.value }))}
          />
        </label>
        <div className={ui.actions}>
          <button
            className={`${ui.btn} ${ui.btnPrimary}`}
            type="submit"
            disabled={state.kind === "loading" || !q.title.trim()}
          >
            Buscar
          </button>
          <button className={`${ui.btn} ${ui.btnDefault}`} type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </form>
      <div className="mt-4" aria-live="polite" aria-busy={state.kind === "loading"}>
        {state.kind === "loading" && <p className={ui.muted}>Buscando capas…</p>}
        {state.kind === "error" && (
          <p className={ui.fieldError} role="alert">
            Não foi possível buscar capas. Tente de novo.
          </p>
        )}
        {state.kind === "done" && state.unavailable.length > 0 && (
          <p className={`${ui.muted} mb-2`}>
            {state.unavailable.map((s) => SOURCE[s]).join(" e ")} não respondeu
            {state.unavailable.includes("google") && " (sem chave da API ou cota diária esgotada)"}.
          </p>
        )}
        {state.kind === "done" &&
          (state.results.length === 0 ? (
            <p className={ui.muted}>Nenhuma capa encontrada. Tente outro título.</p>
          ) : (
            <ul aria-label="Capas encontradas" className="list-none grid grid-cols-3 gap-3 min-[440px]:grid-cols-4">
              {state.results.map((c) => (
                <li key={c.url} className="min-w-0">
                  <button
                    type="button"
                    aria-label={label(c)}
                    title={label(c)}
                    className="block w-full cursor-pointer rounded-control focus-visible:outline-offset-2 enabled:active:scale-98 motion-reduce:enabled:active:scale-100"
                    onClick={() => onPick(c.url)}
                  >
                    <Cover url={c.url} title={c.title ?? ""} fluid loading />
                  </button>
                  <p className="mt-1 text-xs font-medium text-ink truncate">{c.title ?? "Sem título"}</p>
                  <p className={`${ui.mutedXs} truncate`}>{SOURCE[c.source]}</p>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </Dialog>
  );
}
