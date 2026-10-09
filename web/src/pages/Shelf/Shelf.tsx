import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Cover } from "../../components/Cover/Cover";
import { Dialog } from "../../components/Dialog/Dialog";
import { pct } from "../../lib/format";
import { ui } from "../../lib/ui";
import { ShelfTileSkeleton } from "../../components/Skeleton/Skeleton";
import { activateReading, AuthError, FALLBACK_COLORS, getSummary, listReadings, updateReading } from "../../api/client";
import type { ReadingListItem } from "../../api/types";

const STATUS: Record<ReadingListItem["status"], string> = { lendo: "Lendo", lido: "Lido", pausado: "Pausado" };
const chipTone = (s: ReadingListItem["status"]) => (s === "lendo" ? ui.chipLendo : ui.chipOther);
const shelfGrid = "shelf list-none grid grid-cols-3 gap-x-3 gap-y-4 min-[440px]:grid-cols-4 min-[640px]:grid-cols-5";
const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const date = (iso: string) => fmt.format(new Date(iso));
const days = (a: string, b: string) => {
  const x = new Date(a);
  const y = new Date(b);
  return Math.max(1, Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86400000));
};

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
      <div className={ui.stack}>
        <h1 className="sr-only">Estante</h1>
        {err ? (
          <p className={ui.toastError} role="status">{err}</p>
        ) : (
          <ul className={shelfGrid} data-testid="shelf-skeleton" aria-busy="true" aria-label="Carregando estante">
            {Array.from({ length: 6 }, (_, n) => (
              <li key={n} className="min-w-0">
                <ShelfTileSkeleton />
              </li>
            ))}
          </ul>
        )}
      </div>
    );

  const current = items.find((i) => i.id === openId) ?? null;

  return (
    <div className={ui.stack}>
      <h1 className="sr-only">Estante</h1>
      {err && <p className={ui.toastError} role="status">{err}</p>}
      {items.length === 0 ? (
        <section className={`${ui.cardBox} ${ui.emptyState}`}>
          <p className={ui.empty}>Nenhum livro na estante ainda</p>
          <p className={ui.muted}>Os livros que vocês lerem juntos aparecem aqui.</p>
        </section>
      ) : (
        <ul className={shelfGrid}>
          {items.map((i) => (
            <li key={i.id} className="min-w-0">
              <button className="shelf-item w-full min-h-11 flex flex-col items-stretch gap-1.5 p-0 border-0 bg-transparent text-ink text-left cursor-pointer rounded-card focus-visible:outline-offset-3" onClick={() => setOpenId(i.id)}>
                <Cover url={i.cover_url} title={i.title} loading fluid />
                <span className="text-sm font-semibold leading-tight line-clamp-2 wrap-anywhere">{i.title}</span>
                <span className={`${ui.chip} ${chipTone(i.status)}`}>{STATUS[i.status]}</span>
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

  const editBtn = useRef<HTMLButtonElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (editing) ref.current?.querySelector<HTMLElement>("input")?.focus();
    else editBtn.current?.focus();
  }, [editing]);

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
    <label className={ui.field}>
      <span>{label}</span>
      <input className={ui.input} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-invalid={k === "title" && !!formErr} />
    </label>
  );

  return (
    <Dialog ref={ref} labelledBy="shelf-dlg-title" onClose={onClose}>
        <div className={ui.hero}>
          <Cover url={item.cover_url} title={item.title} small />
          <div className={ui.heroText}>
            <h2 id="shelf-dlg-title" className="text-md font-semibold text-balance wrap-anywhere">{item.title}</h2>
            {item.author && <p className={ui.muted}>{item.author}</p>}
            <span className={`${ui.chip} ${chipTone(item.status)}`}>{STATUS[item.status]}</span>
          </div>
        </div>
        {editing ? (
          <form className={ui.stack} onSubmit={save}>
            {field("title", "Título")}
            {formErr && <p className={ui.fieldError} role="alert">{formErr}</p>}
            {field("author", "Autor")}
            {field("goodreads_book_id", "ID do livro no Goodreads")}
            {field("cover_url", "URL da capa", "url")}
            <div className={ui.actions}>
              <button className={`${ui.btn} ${ui.btnPrimary}`} type="submit">Salvar</button>
              <button className={`${ui.btn} ${ui.btnDefault}`} type="button" onClick={() => setEditing(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <>
            <ul className="list-none flex flex-col gap-3.5">
              {item.readers.map((r, idx) => {
                const c = colors[r.name] ?? FALLBACK_COLORS[idx % 2];
                return (
                  <li key={r.name} className="flex flex-col gap-0.5" style={{ ["--c-light" as string]: c.light, ["--c-dark" as string]: c.dark }}>
                    <div className={ui.readerTop}>
                      <span className={ui.name}><span className={ui.dot} aria-hidden="true" />{r.name}</span>
                      <span className={ui.pct}>{pct(r.percentage)}</span>
                    </div>
                    {r.started_at ? (
                      <>
                        <p className={ui.muted}>Começou em {date(r.started_at)}</p>
                        <p className={ui.muted}>{r.finished_at ? `Terminou em ${date(r.finished_at)}` : "Ainda não terminou"}</p>
                        {r.finished_at && (
                          <p className={ui.muted}>{(() => { const n = days(r.started_at, r.finished_at); return `Leu em ${n} ${n === 1 ? "dia" : "dias"}`; })()}</p>
                        )}
                      </>
                    ) : (
                      <p className={ui.muted}>sem dados</p>
                    )}
                  </li>
                );
              })}
            </ul>
            {first && <p className={ui.lead}>{first.name} terminou primeiro</p>}
            <div className={ui.actions}>
              {!item.active && <button className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => void resume()}>Retomar</button>}
              <button ref={editBtn} className={`${ui.btn} ${ui.btnDefault}`} onClick={() => setEditing(true)}>Editar</button>
              <button className={`${ui.btn} ${ui.btnDefault}`} onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
    </Dialog>
  );
}
