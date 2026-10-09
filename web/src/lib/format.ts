export function pct(p: number | null): string {
  return p === null ? "sem dados" : `${Math.round(p * 100)}%`;
}

export function sessionText(s: { from: number; to: number } | null): string {
  return s ? `${Math.round(s.from * 100)}% → ${Math.round(s.to * 100)}%` : "";
}

export function ago(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "sem dados";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "sem dados";
  const min = Math.max(0, Math.floor((now.getTime() - t) / 60000));
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}

/** Name of the reader strictly ahead (whole percentage points), or null on a tie or with fewer than two readers with data. */
export function leader(readers: { name: string; percentage: number | null }[]): string | null {
  const scored = readers.filter((r) => r.percentage !== null).map((r) => ({ name: r.name, v: Math.round((r.percentage ?? 0) * 100) }));
  if (scored.length < 2) return null;
  const top = Math.max(...scored.map((r) => r.v));
  const best = scored.filter((r) => r.v === top);
  return best.length === 1 ? best[0].name : null;
}
