import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AuthError,
  createReading,
  getSummary,
  getUnlinked,
  linkDocument,
  postProgress,
  type Summary,
  type UnlinkedDocument,
} from "./api";

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
  const [msg, setMsg] = useState("");
  const [progErr, setProgErr] = useState("");
  const [titleErr, setTitleErr] = useState("");

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
    const body: { title: string; author?: string; goodreads_book_id?: string } = { title: t };
    if (author.trim()) body.author = author.trim();
    if (grId.trim()) body.goodreads_book_id = grId.trim();
    void run(async () => {
      await createReading(token, body);
      setTitle("");
      setAuthor("");
      setGrId("");
    }, "Leitura criada.");
  };

  const readingId = summary?.reading?.id;

  return (
    <div className="stack">
      {msg && <p className={msg.startsWith("Algo") ? "toast error" : "toast"} role="status">{msg}</p>}
      <form className="card stack" onSubmit={saveProgress}>
        <h3 className="sub">Atualizar meu progresso</h3>
        <label className="field">
          <span>Meu progresso (%)</span>
          <input type="number" inputMode="numeric" min={0} max={100} value={value} aria-invalid={!!progErr} onChange={(e) => setValue(e.target.value)} />
          {progErr && <span className="field-error">{progErr}</span>}
        </label>
        <button className="btn primary" type="submit">Salvar progresso</button>
      </form>

      <form className="card stack" onSubmit={create}>
        <h3 className="sub">Nova leitura</h3>
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
        <button className="btn primary" type="submit">Criar leitura</button>
      </form>

      <section className="card">
        <h3 className="sub">Documentos sem leitura</h3>
        {docs.length === 0 ? (
          <p className="muted">Nenhum documento pendente.</p>
        ) : (
          <ul className="list">
            {docs.map((d) => (
              <li key={d.hash} className="doc">
                <div>
                  <div className="doc-title">{d.title ?? d.hash.slice(0, 8)}</div>
                  <div className="muted">
                    {d.last_device ?? "dispositivo desconhecido"} · {new Date(d.first_seen * 1000).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <button
                  className="btn"
                  disabled={readingId === undefined}
                  onClick={() => void run(() => linkDocument(token, d.hash, readingId!), "Documento vinculado.")}
                >
                  É este livro
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
