import { fireEvent, render, screen, within } from "@testing-library/react";
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
  startFromDocument: vi.fn(),
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

const docRow = async (text: RegExp) => (await screen.findByText(text)).closest("li") as HTMLElement;

beforeEach(() => {
  vi.mocked(api.getSummary).mockReset().mockResolvedValue(makeSummary());
  vi.mocked(api.getUnlinked).mockReset().mockResolvedValue(docs);
  vi.mocked(api.postProgress).mockReset().mockResolvedValue({});
  vi.mocked(api.createReading).mockReset().mockResolvedValue({});
  vi.mocked(api.linkDocument).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.setCover).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.getPalette).mockReset().mockResolvedValue(PALETTE);
  vi.mocked(api.setColor).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.startFromDocument).mockReset().mockResolvedValue({ id: 5 });
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
    const open = async () => {
      const user = userEvent.setup();
      render(<Manage token="tok" />);
      const mine = await screen.findByRole("button", { name: "Mudar minha cor" });
      await user.click(mine);
      return { user, mine, dialog: await screen.findByRole("dialog", { name: "Escolher cor" }) };
    };

    it("shows two circles: mine is a button, other is non-interactive", async () => {
      render(<Manage token="tok" />);
      expect(await screen.findByText("Cores")).toBeTruthy();
      expect(await screen.findByRole("button", { name: "Mudar minha cor" })).toBeTruthy();
      const other = screen.getByLabelText("Cor de Colega");
      expect(other.tagName).not.toBe("BUTTON");
      expect(screen.queryByRole("button", { name: "Cor de Colega" })).toBeNull();
    });

    it("popover lists 8 presets, current pressed, other's disabled", async () => {
      const { dialog } = await open();
      for (const l of LABELS) expect(within(dialog).getByRole("button", { name: l })).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Cor personalizada" })).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Azul" }).getAttribute("aria-pressed")).toBe("true");
      const lar = within(dialog).getByRole("button", { name: "Laranja" }) as HTMLButtonElement;
      expect(lar.disabled).toBe(true);
      expect(lar.getAttribute("title")).toBe("Em uso por Colega");
    });

    it("picking Verde calls setColor, closes, returns focus", async () => {
      const { user, mine, dialog } = await open();
      await user.click(within(dialog).getByRole("button", { name: "Verde" }));
      expect(api.setColor).toHaveBeenCalledWith("tok", "verde");
      await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Escolher cor" })).toBeNull());
      expect(document.activeElement).toBe(mine);
    });

    it("custom color input calls setColor with hex", async () => {
      const { user, dialog } = await open();
      await user.click(within(dialog).getByRole("button", { name: "Cor personalizada" }));
      const input = screen.getByLabelText("Escolher cor personalizada") as HTMLInputElement;
      expect(input.type).toBe("color");
      fireEvent.change(input, { target: { value: "#123456" } });
      expect(api.setColor).toHaveBeenCalledWith("tok", "#123456");
    });

    it("Escape closes the popover", async () => {
      const { user } = await open();
      await user.keyboard("{Escape}");
      await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Escolher cor" })).toBeNull());
    });

    it("409 shows inline error", async () => {
      vi.mocked(api.setColor).mockRejectedValue(Object.assign(new Error("HTTP 409"), { status: 409 }));
      const { user, dialog } = await open();
      await user.click(within(dialog).getByRole("button", { name: "Verde" }));
      expect(await screen.findByText("Essa cor já está em uso")).toBeTruthy();
    });
  });
  describe("documentos sem leitura: começar", () => {
    it("titled doc: Começar a ler este calls startFromDocument; also É este livro", async () => {
      const user = userEvent.setup();
      render(<Manage token="tok" />);
      const row = await docRow(/Messias de Duna/);
      expect(within(row).getByRole("button", { name: "É este livro" })).toBeTruthy();
      await user.click(within(row).getByRole("button", { name: "Começar a ler este" }));
      expect(api.startFromDocument).toHaveBeenCalledWith("tok", "gr:99");
    });

    it("untitled doc: only É este livro", async () => {
      render(<Manage token="tok" />);
      const row = await docRow(/abcdef12/);
      expect(within(row).getByRole("button", { name: "É este livro" })).toBeTruthy();
      expect(within(row).queryByRole("button", { name: "Começar a ler este" })).toBeNull();
    });
  });
});
