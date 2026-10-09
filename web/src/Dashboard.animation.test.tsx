import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSummary } from "./fixtures";

vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  getSummary: vi.fn(),
  getSessions: vi.fn(),
}));

import * as api from "./api";
import { Dashboard } from "./Dashboard";

const KEY = "bookrats.barsAnimated";

function mockMatchMedia(reduce: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes("prefers-reduced-motion"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function scale(name: string): number {
  const el = document.querySelector(`[data-reader="${name}"]`) as HTMLElement;
  const m = /scaleX\(([\d.]+)\)/.exec(el.style.transform);
  if (!m) throw new Error(`no scaleX on ${name}: "${el.style.transform}"`);
  return parseFloat(m[1]);
}

async function load() {
  render(<Dashboard token="tok" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getAllByText(/Duna/).length).toBeGreaterThan(0);
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  sessionStorage.clear();
  mockMatchMedia(false);
  const sum = makeSummary();
  sum.readers[1] = { ...sum.readers[1], percentage: 0.8 };
  vi.mocked(api.getSummary).mockReset().mockResolvedValue(sum);
  vi.mocked(api.getSessions).mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Dashboard bar load animation", () => {
  it("first session mount animates from 0 to value and sets the key", async () => {
    await load();
    expect(scale("Davi")).toBe(0);
    expect(screen.getByTestId("pct-Davi").textContent).toMatch(/^0%/);
    expect(screen.getByRole("progressbar", { name: "Davi" }).getAttribute("aria-valuenow")).toBe("41");
    await advance(1020);
    expect(scale("Davi")).toBeCloseTo(0.41, 2);
    expect(screen.getByTestId("pct-Davi").textContent).toMatch(/^41%/);
    expect(sessionStorage.getItem(KEY)).toBe("1");
  });

  it("does not animate when key already set", async () => {
    sessionStorage.setItem(KEY, "1");
    await load();
    expect(scale("Davi")).toBeCloseTo(0.41, 2);
    expect(screen.getByTestId("pct-Davi").textContent).toMatch(/^41%/);
  });

  it("reduced motion renders final values and sets the key", async () => {
    mockMatchMedia(true);
    await load();
    expect(scale("Davi")).toBeCloseTo(0.41, 2);
    expect(screen.getByTestId("pct-Davi").textContent).toMatch(/^41%/);
    expect(sessionStorage.getItem(KEY)).toBe("1");
  });

  it("staggers the second bar by 120ms", async () => {
    await load();
    await advance(500);
    const first = scale("Davi") / 0.41;
    const second = scale("Colega") / 0.8;
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(1);
    expect(first).toBeGreaterThan(second);
  });
});
