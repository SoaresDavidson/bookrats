import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSummary } from "../../test/fixtures";

vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  getSummary: vi.fn(),
  getSessions: vi.fn(),
}));

import * as api from "../../api/client";
import { Dashboard } from "./Dashboard";

beforeEach(() => {
  vi.mocked(api.getSummary).mockReset().mockResolvedValue(makeSummary());
  vi.mocked(api.getSessions).mockReset().mockResolvedValue([]);
});

describe("Dashboard", () => {
  it("fetches summary with token and renders the book title", async () => {
    render(<Dashboard token="tok" />);
    expect(await screen.findByText(/Duna/)).toBeTruthy();
    expect(api.getSummary).toHaveBeenCalledWith("tok");
  });

  it("renders reader name, pct, session text and ago", async () => {
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    expect(screen.getAllByText(/Davi/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/41%/).length).toBeGreaterThan(0);
    expect(screen.getByText(/34% → 41%/)).toBeTruthy();
    expect(screen.getByText(/há 5 min/)).toBeTruthy();
    expect(screen.getAllByText(/Colega/).length).toBeGreaterThan(0);
  });

  it("renders a progressbar per reader with aria values", async () => {
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    const davi = screen.getByRole("progressbar", { name: "Davi" });
    expect(davi.getAttribute("aria-valuenow")).toBe("41");
    const colega = screen.getByRole("progressbar", { name: "Colega" });
    const now = colega.getAttribute("aria-valuenow");
    expect(now === null || now === "0").toBe(true);
  });

  it("shows 'sem dados' for null percentage", async () => {
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    expect(screen.getAllByText(/sem dados/).length).toBeGreaterThan(0);
  });

  it("shows empty state when reading is null", async () => {
    vi.mocked(api.getSummary).mockResolvedValue({ ...makeSummary(), reading: null });
    render(<Dashboard token="tok" />);
    expect(await screen.findByText(/Nenhuma leitura ativa/)).toBeTruthy();
  });

  it("loads history once per reader name", async () => {
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    await vi.waitFor(() => expect(api.getSessions).toHaveBeenCalledTimes(2));
    const names = vi.mocked(api.getSessions).mock.calls.map((c) => c[1]).sort();
    expect(names).toEqual(["Colega", "Davi"]);
    expect(within(document.body).queryByText(/undefined/)).toBeNull();
  });
});

describe("Dashboard per-reader bars", () => {
  const set = (a: number | null, b: number | null) => {
    const s = makeSummary();
    s.readers[0].percentage = a;
    s.readers[1].percentage = b;
    vi.mocked(api.getSummary).mockResolvedValue(s);
  };
  const w = (name: string) =>
    document.querySelector<HTMLElement>(`[data-reader="${name}"]`)!.style.transform;

  it("gives each reader its own bar with its own width", async () => {
    sessionStorage.setItem("bookrats.barsAnimated", "1");
    set(0.62, 0.58);
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    expect(w("Davi")).toBe("scaleX(0.62)");
    expect(w("Colega")).toBe("scaleX(0.58)");
    expect(screen.getByText("Davi à frente por 4 pontos")).toBeTruthy();
  });

  it("says Empatados when equal", async () => {
    set(0.5, 0.5);
    render(<Dashboard token="tok" />);
    expect(await screen.findByText("Empatados")).toBeTruthy();
  });

  it("formats a negative last session with a plain hyphen", async () => {
    const s = makeSummary();
    s.readers[0].last_session = { from: 0.5, to: 0.47, started_at: s.readers[0].updated_at!, ended_at: s.readers[0].updated_at! };
    vi.mocked(api.getSummary).mockResolvedValue(s);
    render(<Dashboard token="tok" />);
    expect(await screen.findByText(/-3 pontos \(50% → 47%\)/)).toBeTruthy();
  });

  it("shows Sem sessões ainda without a session", async () => {
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    expect(screen.getAllByText("Sem sessões ainda").length).toBeGreaterThan(0);
  });

  it("history is an animated collapsed panel with latest 5 and Ver todas", async () => {
    const mk = (i: number) => ({ from: i / 100, to: (i + 1) / 100, started_at: `2026-01-0${i + 1}T00:00:00Z`, ended_at: `2026-01-0${i + 1}T01:00:00Z` });
    vi.mocked(api.getSessions).mockResolvedValue([0, 1, 2, 3, 4, 5, 6].map(mk));
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    await screen.findAllByText("Ver todas");
    const btn = screen.getAllByRole("button", { name: /Histórico de/ })[0];
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById(btn.getAttribute("aria-controls")!) as HTMLElement;
    expect(panel.getAttribute("role")).toBe("region");
    expect(panel.getAttribute("aria-labelledby")).toBe(btn.id);
    const wrap = panel.firstElementChild as HTMLElement;
    expect(wrap.hasAttribute("inert")).toBe(true);
    expect(panel.querySelectorAll("li").length).toBe(7);
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(wrap.hasAttribute("inert")).toBe(false);
    expect(panel.classList.contains("open")).toBe(true);
    const more = panel.querySelector(".more") as HTMLElement;
    expect(more.hasAttribute("inert")).toBe(true);
    fireEvent.click(within(panel).getByText("Ver todas"));
    expect(more.hasAttribute("inert")).toBe(false);
    expect(within(panel).getByText("Ver menos")).toBeTruthy();
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Dashboard cover", () => {
  it("renders the cover image with title as alt", async () => {
    vi.mocked(api.getSummary).mockResolvedValue(makeSummary("https://x/c.jpg"));
    render(<Dashboard token="tok" />);
    const img = (await screen.findByAltText("Duna")) as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("https://x/c.jpg");
  });

  it("renders an initials placeholder without cover", async () => {
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("cover-placeholder").textContent).toContain("D");
  });
});

describe("Dashboard reader colors", () => {
  it("sets --c-light/--c-dark per reader", async () => {
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    const d = document.querySelector('[data-reader="Davi"]') as HTMLElement;
    const c = document.querySelector('[data-reader="Colega"]') as HTMLElement;
    expect(d.style.getPropertyValue("--c-light")).toBe("#2F6FEB");
    expect(d.style.getPropertyValue("--c-dark")).toBe("#6F9CF5");
    expect(c.style.getPropertyValue("--c-light")).toBe("#D9480F");
    expect(c.style.getPropertyValue("--c-dark")).toBe("#FF8A4C");
  });

  it("uses verde values", async () => {
    const s = makeSummary();
    s.readers[0].color = { id: "verde", light: "#2B8A3E", dark: "#51CF66" };
    vi.mocked(api.getSummary).mockResolvedValue(s);
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    const d = document.querySelector('[data-reader="Davi"]') as HTMLElement;
    expect(d.style.getPropertyValue("--c-light")).toBe("#2B8A3E");
    expect(d.style.getPropertyValue("--c-dark")).toBe("#51CF66");
  });
});
