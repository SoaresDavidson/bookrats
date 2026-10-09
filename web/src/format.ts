export function pct(p: number | null): string {
  return p === null ? "sem dados" : `${Math.round(p * 100)}%`;
}

export function sessionText(s: { from: number; to: number } | null): string {
  return s ? `${Math.round(s.from * 100)}% → ${Math.round(s.to * 100)}%` : "";
}

export function ago(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "sem dados";
  const min = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} dias`;
}
