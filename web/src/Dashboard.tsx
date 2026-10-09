import { useEffect, useState } from "react";
import { AuthError, getSessions, getSummary, type SessionOut, type Summary } from "./api";
import { ago, pct, sessionText } from "./format";

export const COLORS = ["#2F6FEB", "#E8590C"];

interface Props {
  token: string;
  onAuthError?: () => void;
}

export function Dashboard({ token, onAuthError }: Props) {
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
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => {
      alive = false;
      clearInterval(id);
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

  if (!summary) return <p className="muted">{error ? "Não foi possível carregar. Tente de novo em instantes." : "Carregando…"}</p>;
  if (!summary.reading)
    return (
      <section className="card">
        <p className="empty">Nenhuma leitura ativa</p>
        <p className="muted">Crie uma leitura na aba Gerenciar.</p>
      </section>
    );

  const { reading, readers } = summary;
  return (
    <section className="stack">
      {error && <p className="muted">Desatualizado: falha ao atualizar.</p>}
      <div>
        <h2 className="title">{reading.title}</h2>
        {reading.author && <p className="muted">{reading.author}</p>}
      </div>
      <div className="card stack">
        <div className="names">
          {readers.map((r, i) => (
            <span key={r.name} className="name" style={{ color: COLORS[i % 2] }}>
              {r.name} {pct(r.percentage)}
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
                style={{ width: `${v}%`, background: COLORS[i % 2], zIndex: 2 - i, opacity: i ? 0.9 : 1 }}
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
        <div key={r.name} className="card">
          <h3 className="sub" style={{ color: COLORS[i % 2] }}>Histórico de {r.name}</h3>
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
