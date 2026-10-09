import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Cover } from "./Cover";
import { pct } from "./format";
import {
  activateReading,
  AuthError,
  getSummary,
  listReadings,
  updateReading,
  type ReadingListItem,
} from "./api";

const FALLBACK = [
  { light: "#2F6FEB", dark: "#6C9BFF" },
  { light: "#E8590C", dark: "#FF8A4C" },
];
const STATUS: Record<ReadingListItem["status"], string> = { lendo: "Lendo", lido: "Lido", pausado: "Pausado" };
const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const date = (iso: string) => fmt.format(new Date(iso));
const days = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));

interface Props {
  token: string;
  onAuthError?: () => void;
}

export function Shelf({ token, onAuthError }: Props) {
  const [items, setItems] = useState<ReadingListItem[] | null>(null);
  const [colors, setColors] = useState<Record<string, { light: string; dark: string }>>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const guard = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) onAuthError?.();
      else setErr("Algo deu errado. Tente de novo.");
    },
    [onAuthError],
  );

  const load = useCallback(async () => {
    try {
      setItems(await listReadings(token));
    } catch (e) {
      guard(e);
    }
  }, [token, guard]);

  useEffect(() => {
    void load();
    getSummary(token)
      .then((s) => setColors(Object.fromEntries(s.readers.map((r) => [r.name, r.color]))))
      .catch(() => undefined);
  }, [load, token]);

  if (items === null)
    return (
      <div className="stack">
        <h1 className="sr-only">Estante</h1>
        {err ? <p className="toast error" role="status">{err}</p> : <div className="skel c" aria-hidden="true" />}
      </div>
    );

  const current = items.find((i) => i.id === openId) ?? null;

  return (
    <div className="stack">
      <h1 className="sr-only">Estante</h1>
      {err && <p className="toast error" role="status">{err}</p>}
      {items.length === 0 ? (
        <section className="card empty-state">
          <p className="empty">Nenhum livro na estante ainda</p>
          <p className="muted">Os livros que vocês lerem juntos aparecem aqui.</p>
        </section>
      ) : (
        <ul className="shelf">
          {items.map((i) => (
            <li key={i.id}>
              <button className="shelf-item" onClick={() => setOpenId(i.id)}>
                <Cover url={i.cover_url} title={i.title} />
                <span className="shelf-title">{i.title}</span>
                <span className={`chip ${i.status}`}>{STATUS[i.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {current && (
        <Detail
          key={current.id}
          item={current}
          token={token}
          colors={colors}
          guard={guard}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

interface DetailProps {
  item: ReadingListItem;
  token: string;
  colors: Record<string, { light: string; dark: string }>;
  guard: (e: unknown) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

function Detail({ item, token, colors, guard, onClose, onChanged }: DetailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({
    title: item.title,
    author: item.author ?? "",
    goodreads_book_id: item.goodreads_book_id ?? "",
    cover_url: item.cover_url ?? "",
  });
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const els = [...ref.current.querySelectorAll<HTMLElement>("button, input, [tabindex]:not([tabindex='-1'])")].filter((x) => !(x as HTMLButtonElement).disabled);
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const resume = async () => {
    try {
      await activateReading(token, item.id);
      await onChanged();
      onClose();
    } catch (e) {
      guard(e);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const t = f.title.trim();
    if (!t) {
      setFormErr("Informe o título do livro.");
      return;
    }
    const orig = { title: item.title, author: item.author ?? "", goodreads_book_id: item.goodreads_book_id ?? "", cover_url: item.cover_url ?? "" };
    const body: Record<string, string | null> = {};
    if (t !== orig.title) body.title = t;
    for (const k of ["author", "goodreads_book_id", "cover_url"] as const) {
      const v = f[k].trim();
      if (v !== orig[k]) body[k] = v === "" ? null : v;
    }
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }
    try {
      await updateReading(token, item.id, body);
      setEditing(false);
      await onChanged();
    } catch (er) {
      if (er instanceof Error && (er as { status?: number }).status === 422) setFormErr("Dados inválidos. Confira o título e a URL da capa.");
      else guard(er);
    }
  };

  const finished = item.readers.filter((r) => r.finished_at).sort((a, b) => a.finished_at!.localeCompare(b.finished_at!));
  const first = finished.length === 2 && finished[0].finished_at !== finished[1].finished_at ? finished[0] : null;
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-invalid={k === "title" && !!formErr} />
    </label>
  );

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="sheet card stack" role="dialog" aria-modal="true" aria-labelledby="shelf-dlg-title" tabIndex={-1} onKeyDown={onKey}>
        <div className="hero">
          <Cover url={item.cover_url} title={item.title} small />
          <div className="hero-text">
            <h2 id="shelf-dlg-title" className="sub shelf-dlg-title">{item.title}</h2>
            {item.author && <p className="muted">{item.author}</p>}
            <span className={`chip ${item.status}`}>{STATUS[item.status]}</span>
          </div>
        </div>
        {editing ? (
          <form className="stack" onSubmit={save}>
            {field("title", "Título")}
            {formErr && <p className="field-error" role="alert">{formErr}</p>}
            {field("author", "Autor")}
            {field("goodreads_book_id", "ID do livro no Goodreads")}
            {field("cover_url", "URL da capa", "url")}
            <div className="actions">
              <button className="btn primary" type="submit">Salvar</button>
              <button className="btn" type="button" onClick={() => setEditing(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <>
            <ul className="detail-readers">
              {item.readers.map((r, idx) => {
                const c = colors[r.name] ?? FALLBACK[idx % 2];
                return (
                  <li key={r.name} className="detail-reader" style={{ ["--c-light" as string]: c.light, ["--c-dark" as string]: c.dark }}>
                    <div className="reader-top">
                      <span className="name"><span className="dot" aria-hidden="true" />{r.name}</span>
                      <span className="pct">{pct(r.percentage)}</span>
                    </div>
                    {r.started_at ? (
                      <>
                        <p className="muted">Começou em {date(r.started_at)}</p>
                        <p className="muted">{r.finished_at ? `Terminou em ${date(r.finished_at)}` : "Ainda não terminou"}</p>
                        {r.finished_at && (
                          <p className="muted">{(() => { const n = days(r.started_at, r.finished_at); return `Leu em ${n} ${n === 1 ? "dia" : "dias"}`; })()}</p>
                        )}
                      </>
                    ) : (
                      <p className="muted">sem dados</p>
                    )}
                  </li>
                );
              })}
            </ul>
            {first && <p className="lead">{first.name} terminou primeiro</p>}
            <div className="actions">
              {!item.active && <button className="btn primary" onClick={() => void resume()}>Retomar</button>}
              <button className="btn" onClick={() => setEditing(true)}>Editar</button>
              <button className="btn" onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
