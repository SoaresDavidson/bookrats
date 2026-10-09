import { afterEach, expect, test, vi } from "vitest";
import { fetchSummary, FETCH_TIMEOUT_MS } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("never-resolving fetch yields network after timeout and is aborted", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", (_u: string, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    return new Promise((_res, rej) => signal!.addEventListener("abort", () => rej(new Error("aborted"))));
  });
  const p = fetchSummary("http://x", "t");
  await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 1);
  expect(await p).toEqual({ kind: "network" });
  expect(signal?.aborted).toBe(true);
});

test("401 -> auth", async () => {
  vi.stubGlobal("fetch", async () => ({ status: 401, ok: false }));
  expect(await fetchSummary("http://x/", "t")).toEqual({ kind: "auth" });
});
