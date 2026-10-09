import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadingListItem } from "../../api/types";

vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  listReadings: vi.fn(),
  activateReading: vi.fn(),
  updateReading: vi.fn(),
}));

import * as api from "../../api/client";
import { Shelf } from "./Shelf";

const rd = (name: string, pct: number | null, s: string | null, f: string | null) => ({
  name,
  percentage: pct,
  updated_at: f ?? s,
  started_at: s,
  finished_at: f,
});

const READINGS: ReadingListItem[] = [
  {
    id: 1,
    title: "Duna",
    author: "Frank Herbert",
    cover_url: "https://x/d.jpg",
    goodreads_book_id: "55",
    active: true,
    status: "lendo",
    created_at: "2026-03-01T15:00:00Z",
    readers: [rd("Davi", 0.41, "2026-03-05T15:00:00Z", null), rd("Colega", null, null, null)],
  },
  {
    id: 2,
    title: "Neuromancer",
    author: "Gibson",
    cover_url: null,
    goodreads_book_id: null,
    active: false,
    status: "lido",
    created_at: "2026-01-01T15:00:00Z",
    readers: [
      rd("Davi", 1, "2026-01-05T15:00:00Z", "2026-01-12T15:00:00Z"),
      rd("Colega", 1, "2026-01-06T15:00:00Z", "2026-01-20T15:00:00Z"),
    ],
  },
];

beforeEach(() => {
  vi.mocked(api.listReadings).mockReset().mockResolvedValue(READINGS);
  vi.mocked(api.activateReading).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.updateReading).mockReset().mockResolvedValue(undefined);
});

const open = async (title: string) => {
  const user = userEvent.setup();
  render(<Shelf token="tok" />);
  await user.click(await screen.findByText(title));
  return { user, dlg: await screen.findByRole("dialog", { name: title }) };
};

describe("Shelf", () => {
  it("renders covers with alt, titles and status labels", async () => {
    render(<Shelf token="tok" />);
    expect(await screen.findByAltText("Duna")).toBeTruthy();
    expect(screen.getByText("Neuromancer")).toBeTruthy();
    expect(screen.getByText("Lendo")).toBeTruthy();
    expect(screen.getByText("Lido")).toBeTruthy();
    expect(api.listReadings).toHaveBeenCalledWith("tok");
  });

  it("detail shows per-reader dates, duration and who finished first", async () => {
    const { dlg } = await open("Neuromancer");
    const d = within(dlg);
    expect(d.getByText("Começou em 05/01/2026")).toBeTruthy();
    expect(d.getByText("Terminou em 12/01/2026")).toBeTruthy();
    expect(d.getByText("Começou em 06/01/2026")).toBeTruthy();
    expect(d.getByText("Terminou em 20/01/2026")).toBeTruthy();
    expect(d.getByText("Leu em 7 dias")).toBeTruthy();
    expect(d.getByText("Leu em 14 dias")).toBeTruthy();
    expect(d.getByText("Davi terminou primeiro")).toBeTruthy();
  });

  it("unfinished reader and no-data reader", async () => {
    const { dlg } = await open("Duna");
    const d = within(dlg);
    expect(d.getByText("Ainda não terminou")).toBeTruthy();
    expect(d.queryByText(/terminou primeiro/)).toBeNull();
    expect(d.queryByText(/Leu em/)).toBeNull();
  });

  it("active has no Retomar; others do, and it activates then refreshes", async () => {
    const a = await open("Duna");
    expect(within(a.dlg).queryByRole("button", { name: "Retomar" })).toBeNull();
    expect(within(a.dlg).getByRole("button", { name: "Editar" })).toBeTruthy();
  });

  it("Retomar activates then re-fetches", async () => {
    const { user, dlg } = await open("Neuromancer");
    const before = vi.mocked(api.listReadings).mock.calls.length;
    await user.click(within(dlg).getByRole("button", { name: "Retomar" }));
    expect(api.activateReading).toHaveBeenCalledWith("tok", 2);
    await vi.waitFor(() => expect(vi.mocked(api.listReadings).mock.calls.length).toBeGreaterThan(before));
  });

  it("Editar prefills; submit sends only changed fields", async () => {
    const { user, dlg } = await open("Duna");
    await user.click(within(dlg).getByRole("button", { name: "Editar" }));
    const d = within(dlg);
    const title = d.getByLabelText("Título") as HTMLInputElement;
    expect(title.value).toBe("Duna");
    expect((d.getByLabelText("Autor") as HTMLInputElement).value).toBe("Frank Herbert");
    expect((d.getByLabelText("ID do livro no Goodreads") as HTMLInputElement).value).toBe("55");
    expect((d.getByLabelText("URL da capa") as HTMLInputElement).value).toBe("https://x/d.jpg");
    await user.clear(title);
    await user.type(title, "Duna Messias");
    await user.click(d.getByRole("button", { name: "Salvar" }));
    expect(api.updateReading).toHaveBeenCalledWith("tok", 1, { title: "Duna Messias" });
  });

  it("keeps focus inside the dialog across edit toggles; Escape closes", async () => {
    const { user, dlg } = await open("Duna");
    await user.click(within(dlg).getByRole("button", { name: "Editar" }));
    expect(document.activeElement).toBe(within(dlg).getByLabelText("Título"));
    await user.click(within(dlg).getByRole("button", { name: "Cancelar" }));
    expect(document.activeElement).toBe(within(dlg).getByRole("button", { name: "Editar" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["2026-04-01T23:00:00", "2026-04-02T01:00:00", "Leu em 1 dia"],
    ["2026-10-05T08:00:00", "2026-10-07T20:00:00", "Leu em 2 dias"],
    ["2026-04-01T08:00:00", "2026-04-01T20:00:00", "Leu em 1 dia"],
  ])("counts calendar days %s -> %s", async (s, f, text) => {
    vi.mocked(api.listReadings).mockResolvedValue([
      { ...READINGS[1], readers: [rd("Davi", 1, s, f), rd("Colega", null, null, null)] },
    ]);
    const { dlg } = await open("Neuromancer");
    expect(within(dlg).getByText(text)).toBeTruthy();
  });
});

describe("Shelf loading", () => {
  it("shows a skeleton grid until the list resolves", async () => {
    let resolve!: (v: ReadingListItem[]) => void;
    vi.mocked(api.listReadings).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Shelf token="tok" />);
    const sk = screen.getByTestId("shelf-skeleton");
    expect(sk.getAttribute("aria-busy")).toBe("true");
    expect(sk.getAttribute("aria-label")).toBe("Carregando estante");
    expect(sk.querySelectorAll(".shelf-skel-tile").length).toBe(6);
    resolve(READINGS);
    await screen.findByAltText("Duna");
    expect(screen.queryByTestId("shelf-skeleton")).toBeNull();
  });

  it("shows a cover spinner until the image loads", async () => {
    render(<Shelf token="tok" />);
    const img = await screen.findByAltText("Duna");
    expect(document.querySelector(".cover-loading")).toBeTruthy();
    expect(img.closest(".cover-slot")?.getAttribute("aria-busy")).toBe("true");
    fireEvent.load(img);
    await waitFor(() => expect(document.querySelector(".cover-loading")).toBeNull());
  });

  it("falls back to initials when the image errors", async () => {
    render(<Shelf token="tok" />);
    fireEvent.error(await screen.findByAltText("Duna"));
    expect(document.querySelector(".cover-loading")).toBeNull();
    expect(screen.getAllByTestId("cover-placeholder").length).toBe(2);
  });

  it("no spinner when the image is already complete on mount", async () => {
    const d1 = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
    const d2 = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");
    Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 100 });
    try {
      render(<Shelf token="tok" />);
      await screen.findByAltText("Duna");
      expect(document.querySelector(".cover-loading")).toBeNull();
    } finally {
      if (d1) Object.defineProperty(HTMLImageElement.prototype, "complete", d1);
      else Reflect.deleteProperty(HTMLImageElement.prototype, "complete");
      if (d2) Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", d2);
      else Reflect.deleteProperty(HTMLImageElement.prototype, "naturalWidth");
    }
  });
});
