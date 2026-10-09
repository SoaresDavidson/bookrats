export interface SessionOut {
  from: number;
  to: number;
  started_at: string;
  ended_at: string;
}

export interface Reader {
  name: string;
  percentage: number | null;
  updated_at: string | null;
  source: string | null;
  last_session: SessionOut | null;
}

export interface Summary {
  reading: { id: number; title: string; author: string | null; cover_url?: string | null } | null;
  me: string;
  readers: Reader[];
}

export type Outcome =
  | { kind: "ok"; summary: Summary }
  | { kind: "auth" }
  | { kind: "network" }
  | { kind: "unconfigured" };

export async function fetchSummary(baseUrl: string, token: string): Promise<Outcome> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return { kind: "auth" };
    if (!res.ok) return { kind: "network" };
    return { kind: "ok", summary: (await res.json()) as Summary };
  } catch {
    return { kind: "network" };
  }
}
