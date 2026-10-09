import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  searchCovers: vi.fn(),
}));

import * as api from "../../api/client";
import { AuthError } from "../../api/client";
import { CoverSearch } from "./CoverSearch";

const RESULTS = [
  { url: "https://covers.openlibrary.org/b/id/1-L.jpg", title: "Duna", author: "Frank Herbert", source: "openlibrary" },
  { url: "https://books.google.com/x", title: "Duna (edição BR)", author: null, source: "google" },
] as const;

const setup = (props: Partial<Parameters<typeof CoverSearch>[0]> = {}) => {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(<CoverSearch token="tok" title="Duna" author="Frank Herbert" onPick={onPick} onClose={onClose} {...props} />);
  return { onPick, onClose };
};

beforeEach(() => {
  vi.mocked(api.searchCovers)
    .mockReset()
    .mockResolvedValue({ results: [...RESULTS], unavailable: [] });
});

describe("CoverSearch", () => {
  it("searches the reading's title and author on open and lists every option", async () => {
    setup();
    const list = await screen.findByRole("list", { name: "Capas encontradas" });
    expect(api.searchCovers).toHaveBeenCalledWith("tok", "Duna", "Frank Herbert");
    const options = within(list).getAllByRole("button");
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute("aria-label")).toBe("Usar capa: Duna, Frank Herbert (Open Library)");
    expect(options[1].getAttribute("aria-label")).toBe("Usar capa: Duna (edição BR) (Google Books)");
  });

  it("picking an option hands its URL to onPick", async () => {
    const user = userEvent.setup();
    const { onPick } = setup();
    await user.click(await screen.findByRole("button", { name: /Duna \(edição BR\)/ }));
    expect(onPick).toHaveBeenCalledWith("https://books.google.com/x");
  });

  it("searches again with an edited title", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole("list", { name: "Capas encontradas" });
    const title = screen.getByLabelText("Título");
    await user.clear(title);
    await user.type(title, "Dune");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(api.searchCovers).toHaveBeenLastCalledWith("tok", "Dune", "Frank Herbert");
  });

  it("says so when nothing is found", async () => {
    vi.mocked(api.searchCovers).mockResolvedValue({ results: [], unavailable: [] });
    setup();
    expect(await screen.findByText("Nenhuma capa encontrada. Tente outro título.")).toBeTruthy();
  });

  it("shows an error when the search fails and reports auth errors", async () => {
    vi.mocked(api.searchCovers).mockRejectedValue(new Error("down"));
    setup();
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível buscar capas.");
    vi.mocked(api.searchCovers).mockRejectedValue(new AuthError());
    const onAuthError = vi.fn();
    setup({ onAuthError });
    await vi.waitFor(() => expect(onAuthError).toHaveBeenCalled());
  });

  it("closes from the Fechar button", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("names a source that did not answer", async () => {
    vi.mocked(api.searchCovers).mockResolvedValue({ results: [RESULTS[0]], unavailable: ["google"] });
    setup();
    expect(
      await screen.findByText(/Google Books não respondeu \(sem chave da API ou cota diária esgotada\)/),
    ).toBeTruthy();
  });
});
