import type { Outcome, Summary } from "../api";
import { ago, pct, sessionText } from "../format";

export const READER_COLORS = ["#2F6FEB", "#E8590C"];

export interface ReaderRow {
  name: string;
  color: string;
  pct: string;
  fill: number;
  session: string;
  ago: string;
}

export type WidgetState =
  | { kind: "message"; text: string }
  | { kind: "data"; title: string; author: string | null; stale: boolean; readers: ReaderRow[] };

function fromSummary(s: Summary, stale: boolean, now: Date): WidgetState {
  if (!s.reading) return { kind: "message", text: "Nenhuma leitura ativa" };
  return {
    kind: "data",
    title: s.reading.title,
    author: s.reading.author,
    stale,
    readers: s.readers.map((r, i) => ({
      name: r.name,
      color: r.color?.dark ?? READER_COLORS[i % READER_COLORS.length],
      pct: pct(r.percentage),
      fill: r.percentage === null ? 0 : Math.min(1, Math.max(0, r.percentage)),
      session: sessionText(r.last_session),
      ago: ago(r.updated_at, now),
    })),
  };
}

export function toWidgetState(outcome: Outcome, cached: Summary | null, now: Date = new Date()): WidgetState {
  switch (outcome.kind) {
    case "ok":
      return fromSummary(outcome.summary, false, now);
    case "auth":
      return { kind: "message", text: "token inválido" };
    case "unconfigured":
      return { kind: "message", text: "Abra o app para configurar" };
    case "network":
      return cached ? fromSummary(cached, true, now) : { kind: "message", text: "Sem conexão" };
  }
}
