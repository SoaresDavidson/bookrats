import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadingListItem } from "./api";

vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  listReadings: vi.fn(),
  activateReading: vi.fn(),
  updateReading: vi.fn(),
}));

import * as api from "./api";
import { Shelf } from "./Shelf";

const rd = (name: string, pct: number | null, s: string | null, f: string | null) =>
  ({ name, percentage: pct, updated_at: f ?? s, started_at: s, finished_at: f });

const READINGS: ReadingListItem[] = [
  { id: 1, title: "Duna", author: "Frank Herbert", cover_url: "https://x/d.jpg", goodreads_book_id: "55", active: true,
    status: "lendo", created_at: "2026-03-01T15:00:00Z",
    readers: [rd("Davi", 0.41, "2026-03-05T15:00:00Z", null), rd("Colega", null, null, null)] },
  { id: 2, title: "Neuromancer", author: "Gibson", cover_url: null, goodreads_book_id: null, active: false,
    status: "lido", created_at: "2026-01-01T15:00:00Z",
    readers: [rd("Davi", 1, "2026-01-05T15:00:00Z", "2026-01-12T15:00:00Z"), rd("Colega", 1, "2026-01-06T15:00:00Z", "2026-01-20T15:00:00Z")] },
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
});
