import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  AuthError,
  createReading,
  getPalette,
  getSummary,
  getUnlinked,
  HttpError,
  linkDocument,
  postProgress,
  setCover,
  startFromDocument,
} from "../../api/client";
import type { ColorOption, Summary, UnlinkedDocument } from "../../api/types";
import { ColorPicker } from "../../components/ColorPicker/ColorPicker";
import { Cover } from "../../components/Cover/Cover";
import { CoverSearch } from "../../components/CoverSearch/CoverSearch";
import { ui } from "../../lib/ui";

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
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgErr, setMsgErr] = useState(false);
  const notify = (text: string, err = false) => {
    setMsg(text);
    setMsgErr(err);
  };
  const [progErr, setProgErr] = useState("");
  const [titleErr, setTitleErr] = useState("");
  const [palette, setPalette] = useState<ColorOption[]>([]);

  const guard = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) onAuthError?.();
      else {
        setMsg("Algo deu errado. Tente de novo.");
        setMsgErr(true);
      }
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

  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const isPending = (k: string) => pending.has(k);
  const [coverErr, setCoverErr] = useState("");
  const [createCoverErr, setCreateCoverErr] = useState("");
  const COVER_INVALID = "URL inválida (use http ou https)";

  const run = async (
    key: string,
    fn: () => Promise<unknown>,
    ok: string,
    onInvalid?: (detail: unknown) => boolean,
    onConflict?: string,
  ) => {
    if (pendingRef.current.has(key)) return;
    pendingRef.current.add(key);
    setPending(new Set(pendingRef.current));
    try {
      await fn();
      notify(ok);
      await refresh();
    } catch (e) {
      if (e instanceof HttpError && e.status === 409 && onConflict) {
        notify(onConflict, true);
        await refresh();
        return;
      }
      if (e instanceof HttpError && e.status === 422 && onInvalid?.(e.detail)) return;
      guard(e);
    } finally {
      pendingRef.current.delete(key);
      setPending(new Set(pendingRef.current));
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
    void run("progress", () => postProgress(token, n / 100), "Progresso salvo.");
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
    setCreateCoverErr("");
    void run(
      "create",
      async () => {
        await createReading(token, body);
        setTitle("");
        setAuthor("");
        setGrId("");
        setCoverUrl("");
      },
      "Leitura criada.",
      (detail) => {
        if (
          !body.cover_url ||
          !Array.isArray(detail) ||
          !detail.some((i) => Array.isArray(i?.loc) && i.loc.includes("cover_url"))
        )
          return false;
        setCreateCoverErr(COVER_INVALID);
        return true;
      },
    );
  };

  const readingId = summary?.reading?.id;
  const mineIdx = summary ? summary.readers.findIndex((r) => r.name === summary.me) : -1;
  const mine = mineIdx >= 0 ? summary!.readers[mineIdx] : undefined;
  const other = summary?.readers.find((r) => r.name !== summary.me);

  return (
    <div className={ui.stack}>
      <h1 className="sr-only">Gerenciar leitura</h1>
      {msg && (
        <p className={msgErr ? ui.toastError : ui.toast} role="status">
          {msg}
        </p>
      )}
      <form className={`${ui.card} ${ui.stack}`} onSubmit={saveProgress}>
        <h2 className={ui.sub}>Atualizar meu progresso</h2>
        <label className={ui.field}>
          <span>Meu progresso (%)</span>
          <input
            className={ui.input}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={value}
            aria-invalid={!!progErr}
            onChange={(e) => setValue(e.target.value)}
          />
          {progErr && <span className={ui.fieldError}>{progErr}</span>}
        </label>
        <button className={`${ui.btn} ${ui.btnPrimary}`} type="submit" disabled={isPending("progress")}>
          Salvar progresso
        </button>
      </form>

      <section className={`${ui.card} ${ui.stack}`}>
        <h2 className={ui.sub}>Cores</h2>
        <ColorPicker token={token} mine={mine} other={other} palette={palette} refresh={refresh} guard={guard} />
      </section>

      <form className={`${ui.card} ${ui.stack}`} onSubmit={create}>
        <h2 className={ui.sub}>Nova leitura</h2>
        <label className={ui.field}>
          <span>Título</span>
          <input
            className={ui.input}
            value={title}
            aria-invalid={!!titleErr}
            onChange={(e) => setTitle(e.target.value)}
          />
          {titleErr && <span className={ui.fieldError}>{titleErr}</span>}
        </label>
        <label className={ui.field}>
          <span>Autor</span>
          <input className={ui.input} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className={ui.field}>
          <span>ID do livro no Goodreads</span>
          <input className={ui.input} inputMode="numeric" value={grId} onChange={(e) => setGrId(e.target.value)} />
        </label>
        <label className={ui.field}>
          <span>URL da capa (opcional)</span>
          <input
            className={ui.input}
            type="url"
            inputMode="url"
            value={coverUrl}
            aria-invalid={!!createCoverErr}
            onChange={(e) => setCoverUrl(e.target.value)}
          />
          {createCoverErr && <span className={ui.fieldError}>{createCoverErr}</span>}
        </label>
        <button className={`${ui.btn} ${ui.btnPrimary}`} type="submit" disabled={isPending("create")}>
          Criar leitura
        </button>
      </form>

      <form
        className={`${ui.card} ${ui.stack}`}
        onSubmit={(e) => {
          e.preventDefault();
          const u = newCover.trim();
          if (!u) return;
          setCoverErr("");
          void run(
            "cover",
            async () => {
              await setCover(token, readingId!, u);
              setNewCover("");
            },
            "Capa salva.",
            () => {
              setCoverErr(COVER_INVALID);
              return true;
            },
          );
        }}
      >
        <h2 className={ui.sub}>Capa</h2>
        {summary?.reading && <Cover url={summary.reading.cover_url} title={summary.reading.title} small />}
        <label className={ui.field}>
          <span>Nova URL da capa</span>
          <input
            className={ui.input}
            type="url"
            inputMode="url"
            value={newCover}
            aria-invalid={!!coverErr}
            onChange={(e) => setNewCover(e.target.value)}
          />
          {coverErr && <span className={ui.fieldError}>{coverErr}</span>}
        </label>
        <button
          className={`${ui.btn} ${ui.btnDefault}`}
          type="submit"
          disabled={readingId === undefined || isPending("cover") || !newCover.trim()}
        >
          Salvar capa
        </button>
        {summary?.reading?.cover_url && (
          <button
            className={`${ui.btn} ${ui.btnDefault}`}
            type="button"
            disabled={isPending("cover")}
            onClick={() => void run("cover", () => setCover(token, readingId!, null), "Capa removida.")}
          >
            Remover capa
          </button>
        )}
        <button
          className={`${ui.btn} ${ui.btnDefault}`}
          type="button"
          disabled={readingId === undefined}
          onClick={() => setSearching(true)}
        >
          Buscar capa
        </button>
      </form>
      {searching && summary?.reading && (
        <CoverSearch
          token={token}
          title={summary.reading.title}
          author={summary.reading.author}
          onClose={() => setSearching(false)}
          onAuthError={onAuthError}
          onPick={(url) => {
            setSearching(false);
            setCoverErr("");
            void run("cover", () => setCover(token, readingId!, url), "Capa salva.");
          }}
        />
      )}

      <section className={ui.card}>
        <h2 className={ui.sub}>Documentos sem leitura</h2>
        {docs.length === 0 ? (
          <p className={ui.muted}>Nenhum documento pendente.</p>
        ) : (
          <ul>
            {docs.map((d) => (
              <li key={d.hash} className={`${ui.listItem} flex-wrap`}>
                <div>
                  <div className="text-md font-semibold wrap-anywhere">{d.title ?? d.hash.slice(0, 8)}</div>
                  <div className={ui.mutedXs}>
                    {d.last_device ?? "dispositivo desconhecido"} ·{" "}
                    {new Date(d.first_seen * 1000).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  {d.title && (
                    <button
                      type="button"
                      className={`${ui.btn} ${ui.btnPrimary}`}
                      disabled={isPending(`start:${d.hash}`)}
                      onClick={() =>
                        void run(
                          `start:${d.hash}`,
                          () => startFromDocument(token, d.hash),
                          "Leitura iniciada.",
                          undefined,
                          "Esse documento já está ligado a uma leitura.",
                        )
                      }
                    >
                      Começar a ler este
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnDefault}`}
                    disabled={readingId === undefined || isPending(`link:${d.hash}`)}
                    onClick={() =>
                      void run(`link:${d.hash}`, () => linkDocument(token, d.hash, readingId!), "Documento vinculado.")
                    }
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
