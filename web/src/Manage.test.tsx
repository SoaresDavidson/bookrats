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
  setCover: vi.fn(),
  getPalette: vi.fn(),
  setColor: vi.fn(),
}));

import * as api from "./api";
import { Manage } from "./Manage";

const docs: UnlinkedDocument[] = [
  { hash: "abcdef1234567890", title: null, authors: null, last_device: "kindle", first_seen: 1760000000 },
  { hash: "gr:99", title: "Messias de Duna", authors: null, last_device: "goodreads", first_seen: 1760000000 },
];

const PALETTE = [
  ["azul", "#2F6FEB", "#6F9CF5"], ["laranja", "#E8590C", "#FF8A4C"], ["verde", "#2B8A3E", "#51CF66"],
  ["roxo", "#7048E8", "#9775FA"], ["rosa", "#D6336C", "#F06595"], ["ciano", "#0C8599", "#3BC9DB"],
  ["ambar", "#B76E00", "#FCC419"], ["grafite", "#495057", "#ADB5BD"],
].map(([id, light, dark]) => ({ id, light, dark }));
const LABELS = ["Azul", "Laranja", "Verde", "Roxo", "Rosa", "Ciano", "Âmbar", "Grafite"];

beforeEach(() => {
  vi.mocked(api.getSummary).mockReset().mockResolvedValue(makeSummary());
  vi.mocked(api.getUnlinked).mockReset().mockResolvedValue(docs);
  vi.mocked(api.postProgress).mockReset().mockResolvedValue({});
  vi.mocked(api.createReading).mockReset().mockResolvedValue({});
  vi.mocked(api.linkDocument).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.setCover).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.getPalette).mockReset().mockResolvedValue(PALETTE);
  vi.mocked(api.setColor).mockReset().mockResolvedValue(undefined);
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

  it("sends cover_url when filled and omits it when empty", async () => {
    const user = userEvent.setup();
    render(<Manage token="tok" />);
    await user.type(await screen.findByLabelText("Título"), "Neuromancer");
    await user.type(screen.getByLabelText("URL da capa (opcional)"), "https://x/c.jpg");
    await user.click(screen.getByRole("button", { name: "Criar leitura" }));
    expect(api.createReading).toHaveBeenCalledWith("tok", {
      title: "Neuromancer",
      cover_url: "https://x/c.jpg",
    });
  });

  it("changes the cover of the active reading", async () => {
    const user = userEvent.setup();
    render(<Manage token="tok" />);
    const input = await screen.findByLabelText("Nova URL da capa");
    await user.type(input, "https://x/new.jpg");
    await user.click(screen.getByRole("button", { name: "Salvar capa" }));
    expect(api.setCover).toHaveBeenCalledWith("tok", 1, "https://x/new.jpg");
  });

  it("disables save cover without an active reading", async () => {
    vi.mocked(api.getSummary).mockResolvedValue({ ...makeSummary(), reading: null });
    render(<Manage token="tok" />);
    await screen.findByText(/Messias de Duna/);
    const b = screen.getByRole("button", { name: "Salvar capa" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });

  describe("bar color", () => {
    it("shows 8 radios, mine checked, other's disabled with description", async () => {
      render(<Manage token="tok" />);
      await screen.findByText("Cor da minha barra");
      const radios = await screen.findAllByRole("radio");
      expect(radios.map((r) => (r as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? r.getAttribute("aria-label"))
        .map((t) => LABELS.find((l) => t?.startsWith(l)))).toEqual(LABELS);
      expect(screen.getByRole("radio", { name: /^Azul/ })).toHaveProperty("checked", true);
      const lar = screen.getByRole("radio", { name: /^Laranja/ }) as HTMLInputElement;
      expect(lar.disabled).toBe(true);
      const text = (lar.labels?.[0]?.textContent ?? "") + (lar.getAttribute("aria-label") ?? "") +
        (lar.getAttribute("aria-describedby") ? document.getElementById(lar.getAttribute("aria-describedby")!)?.textContent : "");
      expect(text).toContain("em uso por Colega");
    });

    it("selecting Verde calls setColor", async () => {
      const user = userEvent.setup();
      render(<Manage token="tok" />);
      await user.click(await screen.findByRole("radio", { name: /^Verde/ }));
      expect(api.setColor).toHaveBeenCalledWith("tok", "verde");
    });

    it("409 shows inline error", async () => {
      const user = userEvent.setup();
      const err = Object.assign(new Error("HTTP 409"), { status: 409 });
      vi.mocked(api.setColor).mockRejectedValue(err);
      render(<Manage token="tok" />);
      await user.click(await screen.findByRole("radio", { name: /^Verde/ }));
      expect(await screen.findByText("Essa cor já está em uso")).toBeTruthy();
    });
  });
});
