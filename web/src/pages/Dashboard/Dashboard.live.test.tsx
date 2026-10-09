import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSummary } from "../../test/fixtures";

vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  getSummary: vi.fn(),
  getSessions: vi.fn(),
}));

import * as api from "../../api/client";
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

const summaryWith = (p: number) => {
  const s = makeSummary();
  s.readers[0] = { ...s.readers[0], percentage: p };
  return s;
};

// The element carrying is-animating AND is-advanced: the bar fill (data-reader=<name>).
const fill = () => document.querySelector('[data-reader="Davi"]') as HTMLElement;
const pctText = () => screen.getByTestId("pct-Davi").textContent ?? "";
const pctNum = () => parseInt(pctText(), 10);
const scale = () => parseFloat(/scaleX\(([\d.]+)\)/.exec(fill().style.transform)![1]);

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

async function load() {
  render(<Dashboard token="tok" />);
  await advance(0);
  expect(screen.getAllByText(/Duna/).length).toBeGreaterThan(0);
}

/** Next poll returns `p`; advance to just after the 60s tick. */
async function pollTo(p: number) {
  await advance(59_999 - 0);
  vi.mocked(api.getSummary).mockResolvedValue(summaryWith(p));
  await advance(1);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  sessionStorage.clear();
  sessionStorage.setItem(KEY, "1");
  mockMatchMedia(false);
  vi.mocked(api.getSummary).mockReset().mockResolvedValue(summaryWith(0.41));
  vi.mocked(api.getSessions).mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("live progress update", () => {
  it("counts up 41 -> 47 over 600ms in sync with the bar, then settles", async () => {
    await load();
    expect(pctText()).toMatch(/^41%/);
    await pollTo(0.47);
    await advance(300);
    const mid = pctNum();
    expect(mid).toBeGreaterThan(41);
    expect(mid).toBeLessThan(47);
    expect(fill().classList.contains("is-animating")).toBe(true);
    expect(scale()).toBeGreaterThan(0.41);
    expect(scale()).toBeLessThan(0.47);
    expect(scale() * 100).toBeCloseTo(mid, 0);
    await advance(400);
    expect(pctText()).toMatch(/^47%/);
    expect(scale()).toBeCloseTo(0.47, 2);
    expect(fill().classList.contains("is-animating")).toBe(false);
  });

  it("also reacts to a visibilitychange refetch", async () => {
    await load();
    vi.mocked(api.getSummary).mockResolvedValue(summaryWith(0.47));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(300);
    expect(pctNum()).toBeGreaterThan(41);
    expect(pctNum()).toBeLessThan(47);
    await advance(400);
    expect(pctText()).toMatch(/^47%/);
  });

  it("glows on increase for 1600ms then clears", async () => {
    await load();
    expect(fill().classList.contains("is-advanced")).toBe(false);
    await pollTo(0.47);
    await advance(50);
    expect(fill().classList.contains("is-advanced")).toBe(true);
    await advance(1400);
    expect(fill().classList.contains("is-advanced")).toBe(true);
    await advance(250);
    expect(fill().classList.contains("is-advanced")).toBe(false);
  });

  it("does not glow the other reader", async () => {
    await load();
    await pollTo(0.47);
    await advance(50);
    expect(document.querySelector('[data-reader="Colega"]')!.classList.contains("is-advanced")).toBe(false);
  });

  it("decrease animates down without glow", async () => {
    await load();
    await pollTo(0.47);
    await advance(2000);
    vi.mocked(api.getSummary).mockResolvedValue(summaryWith(0.45));
    await advance(60_000);
    await advance(300);
    expect(pctNum()).toBeGreaterThan(45);
    expect(pctNum()).toBeLessThan(47);
    expect(fill().classList.contains("is-animating")).toBe(true);
    expect(fill().classList.contains("is-advanced")).toBe(false);
    await advance(400);
    expect(pctText()).toMatch(/^45%/);
    expect(fill().classList.contains("is-animating")).toBe(false);
  });

  it("unchanged value: no animation, no class", async () => {
    await load();
    await pollTo(0.41);
    await advance(100);
    expect(fill().classList.contains("is-animating")).toBe(false);
    expect(fill().classList.contains("is-advanced")).toBe(false);
    expect(pctText()).toMatch(/^41%/);
  });

  it("reduced motion: jumps to value, still marks is-advanced for 1600ms", async () => {
    mockMatchMedia(true);
    await load();
    await pollTo(0.47);
    await advance(20);
    expect(pctText()).toMatch(/^47%/);
    expect(scale()).toBeCloseTo(0.47, 2);
    expect(fill().classList.contains("is-animating")).toBe(false);
    expect(fill().classList.contains("is-advanced")).toBe(true);
    await advance(1700);
    expect(fill().classList.contains("is-advanced")).toBe(false);
  });

  it("restarts the glow when a second increase arrives mid-glow", async () => {
    await load();
    await pollTo(0.47);
    await advance(50);
    expect(fill().classList.contains("is-advanced")).toBe(true);
    await advance(450);
    vi.mocked(api.getSummary).mockResolvedValue(summaryWith(0.52));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(1);
    expect(fill().classList.contains("is-advanced")).toBe(false);
    await advance(60);
    expect(fill().classList.contains("is-advanced")).toBe(true);
    await advance(1650);
    expect(fill().classList.contains("is-advanced")).toBe(false);
  });

  it("refetches session history when a reader's updated_at changes", async () => {
    await load();
    const before = vi.mocked(api.getSessions).mock.calls.length;
    expect(before).toBe(2);
    await pollTo(0.47);
    await advance(10);
    expect(vi.mocked(api.getSessions).mock.calls.length).toBeGreaterThan(before);
  });
});
