import { useEffect, useState } from "react";
import { AuthError, getSessions, getSummary } from "../../api/client";
import type { Reader, SessionOut, Summary } from "../../api/types";
import { Cover } from "../../components/Cover/Cover";
import { HistoryPanel } from "../../components/HistoryPanel/HistoryPanel";
import { ReaderBar } from "../../components/ProgressBar/ReaderBar";
import { DashboardSkeleton } from "../../components/Skeleton/Skeleton";
import { leader } from "../../lib/format";
import { readerVars } from "../../lib/readerVars";
import { ui } from "../../lib/ui";

interface Props {
  token: string;
  onGoManage?: () => void;
  onAuthError?: () => void;
}

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

function lead(readers: Reader[]): string {
  const [a, b] = readers;
  if (!a || !b || a.percentage === null || b.percentage === null) return "";
  const d = Math.round(a.percentage * 100) - Math.round(b.percentage * 100);
  if (d === 0) return "Empatados";
  const n = Math.abs(d);
  return `${d > 0 ? a.name : b.name} à frente por ${n} ${n === 1 ? "ponto" : "pontos"}`;
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

  const names = summary?.reading ? summary.readers.map((r) => `${r.name}\t${r.updated_at ?? ""}`).join("\n") : "";
  useEffect(() => {
    if (!names) return;
    let alive = true;
    for (const name of names.split("\n").map((n) => n.split("\t")[0])) {
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

  if (!summary)
    return error ? (
      <p className={ui.toastError} role="alert">
        Não foi possível carregar o progresso. Verifique sua conexão; vamos tentar de novo em 1 minuto.
      </p>
    ) : (
      <DashboardSkeleton />
    );
  if (!summary.reading)
    return (
      <section className={`${ui.cardBox} ${ui.emptyState}`}>
        <h1 className="sr-only">Leitura atual</h1>
        <p className={ui.empty}>Nenhuma leitura ativa</p>
        <p className={ui.muted}>Crie uma leitura para começar a comparar o progresso de vocês.</p>
        {onGoManage && (
          <button type="button" className={`${ui.btn} ${ui.btnPrimary} mt-2`} onClick={onGoManage}>
            Ir para Gerenciar
          </button>
        )}
      </section>
    );

  const { reading, readers } = summary;
  const top = leader(readers);
  return (
    <section className={ui.stack}>
      {error && (
        <p className={ui.toastError} role="alert">
          Desatualizado: não foi possível atualizar agora.
        </p>
      )}
      <div className={`${ui.cardBox} p-5 flex flex-col gap-5`}>
        <div className={ui.hero}>
          <Cover url={reading.cover_url} title={reading.title} />
          <div className={ui.heroText}>
            <h1 className={`${ui.title} wrap-anywhere`}>{reading.title}</h1>
            {reading.author && <p className={ui.muted}>{reading.author}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {readers.map((r, i) => (
            <ReaderBar key={r.name} r={r} i={i} animate={animate} leader={r.name === top} />
          ))}
          {lead(readers) && <p className={ui.lead}>{lead(readers)}</p>}
        </div>
      </div>
      {readers.map((r, i) => (
        <HistoryPanel key={r.name} name={r.name} style={readerVars(r, i)} sessions={history[r.name] ?? []} />
      ))}
    </section>
  );
}
