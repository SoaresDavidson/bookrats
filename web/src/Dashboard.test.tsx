import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSummary } from "./fixtures";

vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  getSummary: vi.fn(),
  getSessions: vi.fn(),
}));

import * as api from "./api";
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
    document.querySelector<HTMLElement>(`[data-reader="${name}"]`)!.style.width;

  it("gives each reader its own bar with its own width", async () => {
    set(0.62, 0.58);
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    expect(w("Davi")).toBe("62%");
    expect(w("Colega")).toBe("58%");
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

  it("history is a collapsed details with latest 5 and Ver todas", async () => {
    const mk = (i: number) => ({ from: i / 100, to: (i + 1) / 100, started_at: `2026-01-0${i + 1}T00:00:00Z`, ended_at: `2026-01-0${i + 1}T01:00:00Z` });
    vi.mocked(api.getSessions).mockResolvedValue([0, 1, 2, 3, 4, 5, 6].map(mk));
    render(<Dashboard token="tok" />);
    await screen.findByText(/Duna/);
    await screen.findAllByText("Ver todas");
    const d = document.querySelector("details.history") as HTMLDetailsElement;
    expect(d.open).toBe(false);
    expect(d.querySelectorAll("li").length).toBe(5);
    fireEvent.click(within(d).getByText("Ver todas"));
    expect(d.querySelectorAll("li").length).toBe(7);
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
