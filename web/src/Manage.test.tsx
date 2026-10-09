import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnlinkedDocument } from "./api";
import { makeSummary } from "./fixtures";

vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  getSummary: vi.fn(),
  postProgress: vi.fn(),
  createReading: vi.fn(),
  getUnlinked: vi.fn(),
  linkDocument: vi.fn(),
}));

import * as api from "./api";
import { Manage } from "./Manage";

const docs: UnlinkedDocument[] = [
  { hash: "abcdef1234567890", title: null, authors: null, last_device: "kindle", first_seen: "2026-01-01T00:00:00Z" },
  { hash: "gr:99", title: "Messias de Duna", authors: null, last_device: "goodreads", first_seen: "2026-01-01T00:00:00Z" },
];

beforeEach(() => {
  vi.mocked(api.getSummary).mockReset().mockResolvedValue(makeSummary());
  vi.mocked(api.getUnlinked).mockReset().mockResolvedValue(docs);
  vi.mocked(api.postProgress).mockReset().mockResolvedValue({});
  vi.mocked(api.createReading).mockReset().mockResolvedValue({});
  vi.mocked(api.linkDocument).mockReset().mockResolvedValue(undefined);
});

describe("Manage", () => {
  it("posts manual progress as a fraction", async () => {
    const user = userEvent.setup();
    render(<Manage token="tok" />);
    const input = await screen.findByLabelText("Meu progresso (%)");
    await user.clear(input);
    await user.type(input, "55");
    await user.click(screen.getByRole("button", { name: "Salvar progresso" }));
    expect(api.postProgress).toHaveBeenCalledWith("tok", 0.55);
  });

  it("creates a reading with all fields", async () => {
    const user = userEvent.setup();
    render(<Manage token="tok" />);
    await user.type(await screen.findByLabelText("Título"), "Neuromancer");
    await user.type(screen.getByLabelText("Autor"), "Gibson");
    await user.type(screen.getByLabelText("ID do livro no Goodreads"), "888");
    await user.click(screen.getByRole("button", { name: "Criar leitura" }));
    expect(api.createReading).toHaveBeenCalledWith("tok", {
      title: "Neuromancer",
      author: "Gibson",
      goodreads_book_id: "888",
    });
  });

  it("omits empty optional fields", async () => {
    const user = userEvent.setup();
    render(<Manage token="tok" />);
    await user.type(await screen.findByLabelText("Título"), "Neuromancer");
    await user.click(screen.getByRole("button", { name: "Criar leitura" }));
    expect(api.createReading).toHaveBeenCalledWith("tok", { title: "Neuromancer" });
  });

  it("lists unlinked docs: title or 8-char hash, plus device", async () => {
    render(<Manage token="tok" />);
    expect(await screen.findByText(/Messias de Duna/)).toBeTruthy();
    expect(screen.getByText(/abcdef12/)).toBeTruthy();
    expect(screen.queryByText(/abcdef123/)).toBeNull();
    expect(screen.getByText(/kindle/)).toBeTruthy();
    expect(screen.getByText(/goodreads/)).toBeTruthy();
  });

  it("links a document to the active reading", async () => {
    const user = userEvent.setup();
    render(<Manage token="tok" />);
    await screen.findByText(/Messias de Duna/);
    const buttons = await screen.findAllByRole("button", { name: "É este livro" });
    await vi.waitFor(() => expect((buttons[1] as HTMLButtonElement).disabled).toBe(false));
    await user.click(buttons[1]);
    expect(api.linkDocument).toHaveBeenCalledWith("tok", "gr:99", 1);
  });

  it("disables link buttons without an active reading", async () => {
    vi.mocked(api.getSummary).mockResolvedValue({ ...makeSummary(), reading: null });
    render(<Manage token="tok" />);
    await screen.findByText(/Messias de Duna/);
    const buttons = screen.getAllByRole("button", { name: "É este livro" });
    expect(buttons.length).toBe(2);
    for (const b of buttons) expect((b as HTMLButtonElement).disabled).toBe(true);
  });
});
