const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
}));
jest.mock("react-native-android-widget", () => ({ FlexWidget: () => null, TextWidget: () => null }));

import * as SecureStore from "expo-secure-store";
import { load } from "./handler";

const realFetch = globalThis.fetch;
const stubFetch = (f: unknown) => {
  globalThis.fetch = f as typeof fetch;
};

const summary = { reading: null, me: "a", readers: [] };

beforeEach(() => {
  mockStore.clear();
  mockStore.set("bookrats.url", "http://x");
  mockStore.set("bookrats.token", "t");
  globalThis.fetch = realFetch;
  jest.mocked(SecureStore.getItemAsync).mockClear();
});

test("corrupt cache with failing fetch -> network, no cache", async () => {
  mockStore.set("bookrats.last", "{not json");
  stubFetch(async () => {
    throw new Error("down");
  });
  expect(await load()).toEqual({ outcome: { kind: "network", reason: "down" }, cached: null });
});

test("unconfigured with cache -> unconfigured + cached, no fetch", async () => {
  mockStore.delete("bookrats.url");
  mockStore.delete("bookrats.token");
  mockStore.set("bookrats.last", JSON.stringify(summary));
  const fetchMock = jest.fn();
  stubFetch(fetchMock);
  expect(await load()).toEqual({ outcome: { kind: "unconfigured" }, cached: summary });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("success does not read cache", async () => {
  stubFetch(async () => ({ status: 200, ok: true, json: async () => summary }));
  await load();
  expect(SecureStore.getItemAsync).not.toHaveBeenCalledWith("bookrats.last");
});

test("offline with cache -> network + cached", async () => {
  mockStore.set("bookrats.last", JSON.stringify(summary));
  stubFetch(async () => {
    throw new Error("down");
  });
  expect(await load()).toEqual({ outcome: { kind: "network", reason: "down" }, cached: summary });
});

test("success writes cache", async () => {
  stubFetch(async () => ({ status: 200, ok: true, json: async () => summary }));
  const r = await load();
  expect(r.outcome).toEqual({ kind: "ok", summary });
  expect(JSON.parse(mockStore.get("bookrats.last")!)).toEqual(summary);
});
