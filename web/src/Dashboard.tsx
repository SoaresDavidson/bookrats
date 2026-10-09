import { useEffect, useState } from "react";
import { AuthError, getSessions, getSummary, type SessionOut, type Summary } from "./api";
import { Cover } from "./Cover";
import { ago, pct, sessionText } from "./format";

export const COLORS = ["#2F6FEB", "#E8590C"];

interface Props {
  token: string;
  onGoManage?: () => void;
  onAuthError?: () => void;
}

export function Dashboard({ token, onAuthError, onGoManage }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<Record<string, SessionOut[]>>({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const s = await getSummary(token);
        if (alive) {
          setSummary(s);
          setError(false);
        }
      } catch (e) {
        if (!alive) return;
        if (e instanceof AuthError) onAuthError?.();
        else setError(true);
      }
    };
    void load();
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const id = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [token, onAuthError]);

  const names = summary?.reading ? summary.readers.map((r) => r.name).join("\n") : "";
  useEffect(() => {
    if (!names) return;
    let alive = true;
    for (const name of names.split("\n")) {
      getSessions(token, name)
        .then((s) => alive && setHistory((h) => ({ ...h, [name]: s })))
        .catch((e) => {
          if (alive && e instanceof AuthError) onAuthError?.();
        });
    }
    return () => {
      alive = false;
    };
  }, [token, names, onAuthError]);

  if (!summary) return error ? <p className="alert" role="alert">Não foi possível carregar o progresso. Verifique sua conexão; vamos tentar de novo em 1 minuto.</p> : <div className="stack" aria-busy="true" aria-label="Carregando"><div className="skel t" /><div className="skel c" /><div className="skel b" /></div>;
  if (!summary.reading)
    return (
      <section className="card empty-state">
        <p className="empty">Nenhuma leitura ativa</p>
        <p className="muted">Crie uma leitura para começar a comparar o progresso de vocês.</p>
        {onGoManage && <button className="btn primary" onClick={onGoManage}>Ir para Gerenciar</button>}
      </section>
    );

  const { reading, readers } = summary;
  return (
    <section className="stack">
      {error && <p className="alert" role="alert">Desatualizado: não foi possível atualizar agora.</p>}
      <div className="hero card">
        <Cover url={reading.cover_url} title={reading.title} />
        <div className="hero-text">
          <h2 className="title">{reading.title}</h2>
          {reading.author && <p className="muted">{reading.author}</p>}
        </div>
      </div>
      <div className="card stack">
        <div className="names">
          {readers.map((r, i) => (
            <span key={r.name} className="name">
              <span className="dot" style={{ ["--c" as string]: COLORS[i % 2] }} />{r.name} {pct(r.percentage)}
            </span>
          ))}
        </div>
        <div className="track">
          {readers.map((r, i) => {
            const v = r.percentage === null ? 0 : Math.round(r.percentage * 100);
            return (
              <div
                key={r.name}
                className="fill"
                role="progressbar"
                aria-label={r.name}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={v}
                data-reader={r.name}
                style={{ width: `${v}%`, background: COLORS[i % 2], zIndex: 101 - v, ["--c" as string]: COLORS[i % 2] }}
              />
            );
          })}
        </div>
        <div className="names">
          {readers.map((r) => (
            <div key={r.name} className="meta">
              <div>{sessionText(r.last_session) || "sem dados"}</div>
              <div className="muted">{ago(r.updated_at)}</div>
            </div>
          ))}
        </div>
      </div>
      {readers.map((r, i) => (
        <div key={r.name} className="plain">
          <h3 className="sub"><span className="dot" style={{ ["--c" as string]: COLORS[i % 2] }} />Histórico de {r.name}</h3>
          {(history[r.name] ?? []).length === 0 ? (
            <p className="muted">Sem sessões ainda.</p>
          ) : (
            <ul className="list">
              {history[r.name].map((s) => (
                <li key={s.started_at}>
                  <span>{sessionText(s)}</span>
                  <span className="muted">{ago(s.ended_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
