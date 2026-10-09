import type { ColorOption, CoverSearchResult, ReadingListItem, SessionOut, Summary, UnlinkedDocument } from "./types";

export class HttpError extends Error {
  status: number;
  detail?: unknown;
  constructor(status: number, message = `HTTP ${status}`, detail?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.detail = detail;
  }
}

export class AuthError extends HttpError {
  constructor() {
    super(401, "unauthorized");
    this.name = "AuthError";
  }
}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) {
    const detail = await res.json().then(
      (b) => b?.detail,
      () => undefined,
    );
    throw new HttpError(res.status, undefined, detail);
  }
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

export const getUnlinked = (token: string) => request<UnlinkedDocument[]>(token, "/api/documents/unlinked");

export const linkDocument = (token: string, hash: string, readingId: number) =>
  request<void>(token, `/api/documents/${encodeURIComponent(hash)}/link`, post({ reading_id: readingId }));

export const setCover = (token: string, readingId: number, coverUrl: string | null) =>
  request<void>(token, `/api/readings/${readingId}`, {
    method: "PATCH",
    body: JSON.stringify({ cover_url: coverUrl }),
  });

export const searchCovers = (token: string, title: string, author?: string) => {
  const q = new URLSearchParams({ title });
  if (author) q.set("author", author);
  return request<CoverSearchResult>(token, `/api/covers?${q}`);
};

export const getPalette = (token: string) => request<ColorOption[]>(token, "/api/palette");

export const setColor = (token: string, colorId: string) =>
  request<void>(token, "/api/me/color", { method: "PUT", body: JSON.stringify({ color: colorId }) });

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

export const FALLBACK_COLORS: ColorOption[] = [
  { id: "azul", light: "#2F6FEB", dark: "#6F9CF5" },
  { id: "laranja", light: "#D9480F", dark: "#FF8A4C" },
];
