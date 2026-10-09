import { FETCH_TIMEOUT_MS, fetchSummary } from "./api";

const realFetch = globalThis.fetch;

afterEach(() => {
  jest.useRealTimers();
  globalThis.fetch = realFetch;
});

test("never-resolving fetch yields network after timeout and is aborted", async () => {
  jest.useFakeTimers();
  let signal: AbortSignal | undefined;
  globalThis.fetch = ((_u: string, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    return new Promise((_res, rej) => signal!.addEventListener("abort", () => rej(new Error("aborted"))));
  }) as typeof fetch;
  const p = fetchSummary("http://x", "t");
  await jest.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 1);
  expect(await p).toEqual({ kind: "network", reason: "tempo esgotado" });
  expect(signal?.aborted).toBe(true);
});

test("401 -> auth", async () => {
  globalThis.fetch = (async () => ({ status: 401, ok: false })) as unknown as typeof fetch;
  expect(await fetchSummary("http://x/", "t")).toEqual({ kind: "auth" });
});

test("non-ok status -> network with status", async () => {
  globalThis.fetch = (async () => ({ status: 502, ok: false })) as unknown as typeof fetch;
  expect(await fetchSummary("http://x", "t")).toEqual({ kind: "network", reason: "HTTP 502" });
});
