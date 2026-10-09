import { beforeEach, expect, test, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: async (k: string, v: string) => void store.set(k, v),
}));
vi.mock("react-native-android-widget", () => ({ FlexWidget: () => null, TextWidget: () => null }));

import * as SecureStore from "expo-secure-store";
import { load } from "./handler";

const summary = { reading: null, me: "a", readers: [] };

beforeEach(() => {
  store.clear();
  store.set("bookrats.url", "http://x");
  store.set("bookrats.token", "t");
  vi.unstubAllGlobals();
  vi.mocked(SecureStore.getItemAsync).mockClear();
});

test("corrupt cache with failing fetch -> network, no cache", async () => {
  store.set("bookrats.last", "{not json");
  vi.stubGlobal("fetch", async () => { throw new Error("down"); });
  expect(await load()).toEqual({ outcome: { kind: "network" }, cached: null });
});

test("unconfigured with cache -> unconfigured + cached, no fetch", async () => {
  store.delete("bookrats.url");
  store.delete("bookrats.token");
  store.set("bookrats.last", JSON.stringify(summary));
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(await load()).toEqual({ outcome: { kind: "unconfigured" }, cached: summary });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("success does not read cache", async () => {
  vi.stubGlobal("fetch", async () => ({ status: 200, ok: true, json: async () => summary }));
  await load();
  expect(SecureStore.getItemAsync).not.toHaveBeenCalledWith("bookrats.last");
});

test("offline with cache -> network + cached", async () => {
  store.set("bookrats.last", JSON.stringify(summary));
  vi.stubGlobal("fetch", async () => { throw new Error("down"); });
  expect(await load()).toEqual({ outcome: { kind: "network" }, cached: summary });
});

test("success writes cache", async () => {
  vi.stubGlobal("fetch", async () => ({ status: 200, ok: true, json: async () => summary }));
  const r = await load();
  expect(r.outcome).toEqual({ kind: "ok", summary });
  expect(JSON.parse(store.get("bookrats.last")!)).toEqual(summary);
});
