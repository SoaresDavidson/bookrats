import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Cover } from "./Cover";
import {
  AuthError,
  createReading,
  getPalette,
  getSummary,
  setColor,
  type ColorOption,
  getUnlinked,
  linkDocument,
  setCover,
  startFromDocument,
  postProgress,
  type Summary,
  type UnlinkedDocument,
} from "./api";

function mark(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#18181b" : "#ffffff";
}

interface Props {
  token: string;
  onAuthError?: () => void;
}

export function Manage({ token, onAuthError }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [docs, setDocs] = useState<UnlinkedDocument[]>([]);
  const [value, setValue] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [grId, setGrId] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [newCover, setNewCover] = useState("");
  const [msg, setMsg] = useState("");
  const [progErr, setProgErr] = useState("");
  const [titleErr, setTitleErr] = useState("");
  const [palette, setPalette] = useState<ColorOption[]>([]);
  const [colorErr, setColorErr] = useState("");

  const guard = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) onAuthError?.();
      else setMsg("Algo deu errado. Tente de novo.");
    },
    [onAuthError],
  );

  const refresh = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([getSummary(token), getUnlinked(token)]);
      setSummary(s);
      setDocs(d);
      const mine = s.readers.find((r) => r.name === s.me);
      if (mine?.percentage != null) setValue((v) => v || String(Math.round(mine.percentage! * 100)));
    } catch (e) {
      guard(e);
    }
  }, [token, guard]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    getPalette(token).then(setPalette).catch(guard);
  }, [token, guard]);

  const pick = async (id: string) => {
    setColorErr("");
    try {
      await setColor(token, id);
      await refresh();
    } catch (e) {
      if (e instanceof Error && (e as { status?: number }).status === 409) {
        setColorErr("Essa cor já está em uso");
        await refresh();
      }
      else guard(e);
    }
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      await refresh();
    } catch (e) {
      guard(e);
    }
  };

  const saveProgress = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    if (value === "" || Number.isNaN(n) || n < 0 || n > 100) {
      setProgErr("Informe um valor entre 0 e 100.");
      return;
    }
    setProgErr("");
    void run(() => postProgress(token, n / 100), "Progresso salvo.");
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      setTitleErr("Informe o título do livro.");
      return;
    }
    setTitleErr("");
    const body: { title: string; author?: string; goodreads_book_id?: string; cover_url?: string } = { title: t };
    if (author.trim()) body.author = author.trim();
    if (grId.trim()) body.goodreads_book_id = grId.trim();
    if (coverUrl.trim()) body.cover_url = coverUrl.trim();
    void run(async () => {
      await createReading(token, body);
      setTitle("");
      setAuthor("");
      setGrId("");
      setCoverUrl("");
    }, "Leitura criada.");
  };

  const readingId = summary?.reading?.id;
  const mineIdx = summary ? summary.readers.findIndex((r) => r.name === summary.me) : -1;
  const mine = mineIdx >= 0 ? summary!.readers[mineIdx] : undefined;
  const other = summary?.readers.find((r) => r.name !== summary.me);
  const LABELS: Record<string, string> = { azul: "Azul", laranja: "Laranja", verde: "Verde", roxo: "Roxo", rosa: "Rosa", ciano: "Ciano", ambar: "Âmbar", grafite: "Grafite" };

  return (
    <div className="stack">
      <h1 className="sr-only">Gerenciar leitura</h1>
      {msg && <p className={msg.startsWith("Algo") ? "toast error" : "toast"} role="status">{msg}</p>}
      <form className="card stack" onSubmit={saveProgress}>
        <h2 className="sub">Atualizar meu progresso</h2>
        <label className="field">
          <span>Meu progresso (%)</span>
          <input type="number" inputMode="numeric" min={0} max={100} value={value} aria-invalid={!!progErr} onChange={(e) => setValue(e.target.value)} />
          {progErr && <span className="field-error">{progErr}</span>}
        </label>
        <button className="btn primary" type="submit">Salvar progresso</button>
      </form>

      <fieldset className="card swatches" aria-describedby={colorErr ? "color-err" : undefined}>
        <legend className="sub">Cor da minha barra</legend>
        <div className="swatch-grid">
          {palette.map((c) => {
            const taken = other?.color.id === c.id;
            return (
              <label key={c.id} className="swatch" style={{ ["--c-light" as string]: c.light, ["--c-dark" as string]: c.dark, ["--mark" as string]: mark(c.light), ["--mark-dark" as string]: mark(c.dark) }}>
                <input
                  type="radio"
                  name="bar-color"
                  value={c.id}
                  checked={mine?.color.id === c.id}
                  disabled={taken}
                  onChange={() => void pick(c.id)}
                />
                <span>
                  {LABELS[c.id] ?? c.id}
                  {taken && <span className="xs"> em uso por {other!.name}</span>}
                </span>
              </label>
            );
          })}
        </div>
        {colorErr && <p id="color-err" className="field-error" role="alert">{colorErr}</p>}
      </fieldset>

      <form className="card stack" onSubmit={create}>
        <h2 className="sub">Nova leitura</h2>
        <label className="field">
          <span>Título</span>
          <input value={title} aria-invalid={!!titleErr} onChange={(e) => setTitle(e.target.value)} />
          {titleErr && <span className="field-error">{titleErr}</span>}
        </label>
        <label className="field">
          <span>Autor</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="field">
          <span>ID do livro no Goodreads</span>
          <input inputMode="numeric" value={grId} onChange={(e) => setGrId(e.target.value)} />
        </label>
        <label className="field">
          <span>URL da capa (opcional)</span>
          <input type="url" inputMode="url" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
        </label>
        <button className="btn primary" type="submit">Criar leitura</button>
      </form>

      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          const u = newCover.trim();
          void run(async () => {
            await setCover(token, readingId!, u === "" ? null : u);
            setNewCover("");
          }, "Capa salva.");
        }}
      >
        <h2 className="sub">Capa</h2>
        {summary?.reading && (
          <Cover url={summary.reading.cover_url} title={summary.reading.title} small />
        )}
        <label className="field">
          <span>Nova URL da capa</span>
          <input type="url" inputMode="url" value={newCover} onChange={(e) => setNewCover(e.target.value)} />
        </label>
        <button className="btn" type="submit" disabled={readingId === undefined}>Salvar capa</button>
      </form>

      <section className="card">
        <h2 className="sub">Documentos sem leitura</h2>
        {docs.length === 0 ? (
          <p className="muted">Nenhum documento pendente.</p>
        ) : (
          <ul className="list">
            {docs.map((d) => (
              <li key={d.hash} className="doc">
                <div>
                  <div className="doc-title">{d.title ?? d.hash.slice(0, 8)}</div>
                  <div className="muted xs">
                    {d.last_device ?? "dispositivo desconhecido"} · {new Date(d.first_seen * 1000).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="doc-actions">
                {d.title && (
                  <button className="btn primary" onClick={() => void run(() => startFromDocument(token, d.hash), "Leitura iniciada.")}>
                    Começar a ler este
                  </button>
                )}
                <button
                  className="btn"
                  disabled={readingId === undefined}
                  onClick={() => void run(() => linkDocument(token, d.hash, readingId!), "Documento vinculado.")}
                >
                  É este livro
                </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
