import { useEffect, useState, useId } from "react";
import { AuthError, getSessions, getSummary, type Reader, type SessionOut, type Summary } from "./api";
import { Cover } from "./Cover";
import { ago, pct, sessionText } from "./format";
import { useCountUp } from "./useCountUp";

const KEY = "bookrats.barsAnimated";

function shouldAnimate(): boolean {
  try {
    if (sessionStorage.getItem(KEY)) return false;
  } catch {
    return false;
  }
  try {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

function ReaderBar({ r, i, animate }: { r: Reader; i: number; animate: boolean }) {
  const v = r.percentage === null ? 0 : Math.round(r.percentage * 100);
  const shown = useCountUp(v, { animate, delay: i * 120, duration: 800 });
  const text = shown === v ? pct(r.percentage) : `${Math.round(shown)}%`;
  return (
    <div className="reader">
      <div className="reader-top">
        <span className="name"><span className="dot" style={vars(r, i)} />{r.name}</span>
        <span className="pct" data-testid={`pct-${r.name}`}>{text}</span>
      </div>
      <div className="bar">
        <div
          className="bar-fill"
          role="progressbar"
          aria-label={r.name}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={v}
          data-reader={r.name}
          style={{ transform: `scaleX(${shown / 100})`, transformOrigin: "left", ...vars(r, i) }}
        />
      </div>
      <p className="muted">{lastLine(r)}</p>
    </div>
  );
}

const FALLBACK = [
  { id: "azul", light: "#2F6FEB", dark: "#6F9CF5" },
  { id: "laranja", light: "#E8590C", dark: "#FF8A4C" },
];

function vars(r: Reader, i: number): React.CSSProperties {
  const c = r.color ?? FALLBACK[i % 2];
  return { ["--c-light" as string]: c.light, ["--c-dark" as string]: c.dark };
}

interface Props {
  token: string;
  onGoManage?: () => void;
  onAuthError?: () => void;
}

function points(s: { from: number; to: number }): string {
  const a = Math.round(s.from * 100);
  const b = Math.round(s.to * 100);
  const d = b - a;
  const n = Math.abs(d);
  return `${d > 0 ? "+" : d < 0 ? "-" : ""}${n} ${n === 1 ? "ponto" : "pontos"} (${a}% → ${b}%)`;
}

function lastLine(r: Reader) {
  if (!r.last_session) return "Sem sessões ainda";
  return (
    <>
      <span className="nowrap">Última sessão {ago(r.updated_at)}</span>
      {" · "}
      <span className="nowrap">{points(r.last_session)}</span>
    </>
  );
}

function lead(readers: Reader[]): string {
  const [a, b] = readers;
  if (!a || !b || a.percentage === null || b.percentage === null) return "";
  const d = Math.round(a.percentage * 100) - Math.round(b.percentage * 100);
  if (d === 0) return "Empatados";
  const n = Math.abs(d);
  return `${d > 0 ? a.name : b.name} à frente por ${n} ${n === 1 ? "ponto" : "pontos"}`;
}

function HistoryList({ name, style, sessions }: { name: string; style: React.CSSProperties; sessions: SessionOut[] }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const uid = useId();
  const bid = `${uid}-btn`;
  const pid = `${uid}-panel`;
  const row = (s: SessionOut) => (
    <li key={s.started_at}>
      <span>{sessionText(s)}</span>
      <span className="muted xs">{ago(s.ended_at)}</span>
    </li>
  );
  return (
    <div className="history">
      <button type="button" id={bid} className="history-toggle" aria-expanded={open} aria-controls={pid} onClick={() => setOpen((v) => !v)}>
        <span className="dot" style={style} />Histórico de {name}
        <svg className="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div id={pid} role="region" aria-labelledby={bid} className={`collapse${open ? " open" : ""}`}>
        <div className="collapse-inner" inert={!open}>
          {sessions.length === 0 ? (
            <p className="muted">Sem sessões ainda.</p>
          ) : (
            <>
              <ul className="list">{sessions.slice(0, 5).map(row)}</ul>
              {sessions.length > 5 && (
                <>
                  <div className={`collapse more${all ? " open" : ""}`} inert={!all}>
                    <div className="collapse-inner"><ul className="list">{sessions.slice(5).map(row)}</ul></div>
                  </div>
                  <button className="link" type="button" onClick={() => setAll((v) => !v)}>
                    {all ? "Ver menos" : "Ver todas"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ token, onAuthError, onGoManage }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const [animate] = useState(shouldAnimate);
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

  const loaded = !!summary?.reading;
  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  }, [loaded]);

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
        <h1 className="sr-only">Leitura atual</h1>
        <p className="empty">Nenhuma leitura ativa</p>
        <p className="muted">Crie uma leitura para começar a comparar o progresso de vocês.</p>
        {onGoManage && <button className="btn primary" onClick={onGoManage}>Ir para Gerenciar</button>}
      </section>
    );

  const { reading, readers } = summary;
  return (
    <section className="stack">
      {error && <p className="alert" role="alert">Desatualizado: não foi possível atualizar agora.</p>}
      <div className="card hero-card">
        <div className="hero">
          <Cover url={reading.cover_url} title={reading.title} />
          <div className="hero-text">
            <h1 className="title">{reading.title}</h1>
            {reading.author && <p className="muted">{reading.author}</p>}
          </div>
        </div>
        <div className="readers">
          {readers.map((r, i) => <ReaderBar key={r.name} r={r} i={i} animate={animate} />)}
          {lead(readers) && <p className="lead">{lead(readers)}</p>}
        </div>
      </div>
      {readers.map((r, i) => (
        <HistoryList key={r.name} name={r.name} style={vars(r, i)} sessions={history[r.name] ?? []} />
      ))}
    </section>
  );
}
