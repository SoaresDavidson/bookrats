import { render, screen, within } from "@testing-library/react";
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
