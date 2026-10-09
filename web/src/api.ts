export class AuthError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "AuthError";
  }
}

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
  reading: { id: number; title: string; author: string | null; cover_url: string | null } | null;
  me: string;
  readers: Reader[];
}

export interface UnlinkedDocument {
  hash: string;
  title: string | null;
  authors: string | null;
  last_device: string | null;
  first_seen: number;
}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const getSummary = (token: string) => request<Summary>(token, "/api/summary");

export const getSessions = (token: string, user: string, limit = 20) =>
  request<SessionOut[]>(token, `/api/sessions?user=${encodeURIComponent(user)}&limit=${limit}`);

export const postProgress = (token: string, percentage: number) =>
  request<unknown>(token, "/api/progress", post({ percentage }));

export const createReading = (
  token: string,
  body: { title: string; author?: string; goodreads_book_id?: string; cover_url?: string },
) => request<unknown>(token, "/api/readings", post(body));

export const getUnlinked = (token: string) =>
  request<UnlinkedDocument[]>(token, "/api/documents/unlinked");

export const linkDocument = (token: string, hash: string, readingId: number) =>
  request<void>(token, `/api/documents/${encodeURIComponent(hash)}/link`, post({ reading_id: readingId }));

export const setCover = (token: string, readingId: number, coverUrl: string | null) =>
  request<void>(token, `/api/readings/${readingId}`, {
    method: "PATCH",
    body: JSON.stringify({ cover_url: coverUrl }),
  });
