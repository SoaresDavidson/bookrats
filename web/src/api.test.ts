import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  AuthError, createReading, getSessions, getSummary, getUnlinked, linkDocument, postProgress,
} from "./api";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as unknown as typeof fetch; });
afterEach(() => { vi.restoreAllMocks(); });

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
