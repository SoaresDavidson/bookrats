export class HttpError extends Error {
  status: number;
  constructor(status: number, message = `HTTP ${status}`) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export class AuthError extends HttpError {
  constructor() {
    super(401, "unauthorized");
    this.name = "AuthError";
  }
}

export interface ColorOption {
  id: string;
  light: string;
  dark: string;
}

export interface SessionOut {
  from: number;
  to: number;
  started_at: string;
  ended_at: string;
}

export interface Reader {
  name: string;
  color: ColorOption;
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
  if (!res.ok) throw new HttpError(res.status);
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

export const getPalette = (token: string) => request<ColorOption[]>(token, "/api/palette");

export const setColor = (token: string, colorId: string) =>
  request<void>(token, "/api/me/color", { method: "PUT", body: JSON.stringify({ color: colorId }) });

export interface ReadingReader {
  name: string;
  percentage: number | null;
  updated_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface ReadingListItem {
  id: number;
  title: string;
  author: string | null;
  cover_url: string | null;
  goodreads_book_id: string | null;
  active: boolean;
  status: "lendo" | "lido" | "pausado";
  created_at: string;
  readers: ReadingReader[];
}

export const listReadings = (token: string) => request<ReadingListItem[]>(token, "/api/readings");

export const activateReading = (token: string, id: number) =>
  request<void>(token, `/api/readings/${id}/activate`, { method: "POST" });

export const updateReading = (
  token: string,
  id: number,
  fields: { title?: string; author?: string | null; goodreads_book_id?: string | null; cover_url?: string | null },
) => request<void>(token, `/api/readings/${id}`, { method: "PATCH", body: JSON.stringify(fields) });

export const startFromDocument = (token: string, hash: string) =>
  request<{ id: number }>(token, `/api/documents/${encodeURIComponent(hash)}/start`, post({}));
