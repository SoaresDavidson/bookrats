import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  AuthError,
  activateReading,
  createReading,
  getPalette,
  getSessions,
  getSummary,
  getUnlinked,
  HttpError,
  linkDocument,
  listReadings,
  postProgress,
  setColor,
  setCover,
  startFromDocument,
  updateReading,
} from "./client";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("getSummary sends bearer token and returns body", async () => {
  const body = { reading: null, readers: [] };
  fetchMock.mockResolvedValue(json(body));
  await expect(getSummary("tok")).resolves.toEqual(body);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/summary");
  expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
});

test("401 rejects with AuthError", async () => {
  fetchMock.mockImplementation(async () => new Response("nope", { status: 401 }));
  await expect(getSummary("bad")).rejects.toBeInstanceOf(AuthError);
  await expect(getSessions("bad", "Davi")).rejects.toBeInstanceOf(AuthError);
  await expect(postProgress("bad", 0.2)).rejects.toBeInstanceOf(AuthError);
  await expect(createReading("bad", { title: "x" })).rejects.toBeInstanceOf(AuthError);
  await expect(getUnlinked("bad")).rejects.toBeInstanceOf(AuthError);
  await expect(linkDocument("bad", "h", 1)).rejects.toBeInstanceOf(AuthError);
});

test("500 rejects with plain Error, not AuthError", async () => {
  fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
  const err = await getSummary("tok").catch((e) => e);
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(AuthError);
});

test("postProgress posts JSON body", async () => {
  fetchMock.mockResolvedValue(json({}, 201));
  await postProgress("tok", 0.2);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/progress");
  expect(init.method).toBe("POST");
  expect(init.body).toBe('{"percentage":0.2}');
  expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
});

test("linkDocument encodes hash, posts reading_id, tolerates 204", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await expect(linkDocument("tok", "gr:1", 3)).resolves.toBeUndefined();
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/documents/gr%3A1/link");
  expect(init.method).toBe("POST");
  expect(init.body).toBe('{"reading_id":3}');
});

test("getSessions builds query", async () => {
  fetchMock.mockResolvedValue(json([]));
  await getSessions("tok", "Davi");
  expect(fetchMock.mock.calls[0][0]).toBe("/api/sessions?user=Davi&limit=20");
});

test("setCover patches the reading and tolerates 204", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await expect(setCover("tok", 3, "u")).resolves.toBeUndefined();
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/readings/3");
  expect(init.method).toBe("PATCH");
  expect(init.body).toBe('{"cover_url":"u"}');
});

test("getPalette gets /api/palette", async () => {
  fetchMock.mockResolvedValue(json([{ id: "azul", light: "#2F6FEB", dark: "#6F9CF5" }]));
  await getPalette("tok");
  expect(fetchMock.mock.calls[0][0]).toBe("/api/palette");
});

test("setColor puts the color id", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await expect(setColor("tok", "verde")).resolves.toBeUndefined();
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/me/color");
  expect(init.method).toBe("PUT");
  expect(init.body).toBe('{"color":"verde"}');
});

test("setColor 409 rejects with HttpError status 409", async () => {
  fetchMock.mockResolvedValue(new Response('{"detail":"cor em uso"}', { status: 409 }));
  const e = await setColor("tok", "azul").catch((x) => x);
  expect(e).toBeInstanceOf(HttpError);
  expect(e.status).toBe(409);
});

test("listReadings GETs /api/readings", async () => {
  fetchMock.mockResolvedValue(json([]));
  await expect(listReadings("tok")).resolves.toEqual([]);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/readings");
});

test("activateReading POSTs activate", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await activateReading("tok", 3);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/readings/3/activate");
  expect(init.method).toBe("POST");
});

test("updateReading PATCHes only given fields", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await updateReading("tok", 3, { title: "X" });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/readings/3");
  expect(init.method).toBe("PATCH");
  expect(init.body).toBe('{"title":"X"}');
});

test("startFromDocument POSTs encoded hash and returns id", async () => {
  fetchMock.mockResolvedValue(json({ id: 9 }, 201));
  await expect(startFromDocument("tok", "gr:1")).resolves.toEqual({ id: 9 });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/documents/gr%3A1/start");
  expect(init.method).toBe("POST");
});

test("HttpError.detail comes from a JSON body", async () => {
  fetchMock.mockResolvedValue(json({ detail: [{ loc: ["body", "cover_url"] }] }, 422));
  const err = await createReading("tok", { title: "x" }).catch((e) => e);
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).detail).toEqual([{ loc: ["body", "cover_url"] }]);
});

test("HttpError.detail is undefined for a non-JSON body", async () => {
  fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
  const err = await getSummary("tok").catch((e) => e);
  expect(err.detail).toBeUndefined();
});
