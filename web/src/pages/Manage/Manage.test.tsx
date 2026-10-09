import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnlinkedDocument } from "../../api/types";
import { makeSummary } from "../../test/fixtures";

vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  getSummary: vi.fn(),
  postProgress: vi.fn(),
  createReading: vi.fn(),
  getUnlinked: vi.fn(),
  linkDocument: vi.fn(),
  setCover: vi.fn(),
  getPalette: vi.fn(),
  setColor: vi.fn(),
  startFromDocument: vi.fn(),
  searchCovers: vi.fn(),
}));

import * as api from "../../api/client";
import { Manage } from "./Manage";

const docs: UnlinkedDocument[] = [
  { hash: "abcdef1234567890", title: null, authors: null, last_device: "kindle", first_seen: 1760000000 },
  { hash: "gr:99", title: "Messias de Duna", authors: null, last_device: "goodreads", first_seen: 1760000000 },
];

const LABELS = ["Azul", "Laranja", "Verde", "Roxo", "Rosa", "Ciano", "Âmbar", "Grafite"];
const PALETTE = [
  ["azul", "#2F6FEB", "#6F9CF5"],
  ["laranja", "#D9480F", "#FF8A4C"],
  ["verde", "#2B8A3E", "#51CF66"],
  ["roxo", "#7048E8", "#9775FA"],
  ["rosa", "#D6336C", "#F06595"],
  ["ciano", "#0C8599", "#3BC9DB"],
  ["ambar", "#B76E00", "#FCC419"],
  ["grafite", "#495057", "#ADB5BD"],
].map(([id, light, dark], i) => ({ id, label: LABELS[i], light, dark }));

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
  vi.mocked(api.searchCovers)
    .mockReset()
    .mockResolvedValue({
      results: [
        { url: "https://covers.openlibrary.org/b/id/9-L.jpg", title: "Duna", author: null, source: "openlibrary" },
      ],
      unavailable: [],
    });
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

    it("focus moves to the pressed preset; Tab wraps; Esc returns focus", async () => {
      const { user, mine, dialog } = await open();
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Azul" }));
      within(dialog).getByRole("button", { name: "Cor personalizada" }).focus();
      await user.tab();
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Azul" }));
      await user.keyboard("{Escape}");
      await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(mine);
    });

    it("outside pointerdown on non-focusable area returns focus to the circle", async () => {
      const { user, mine } = await open();
      await user.pointer({ keys: "[MouseLeft]", target: document.body });
      await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(mine);
    });

    it("outside pointerdown on another focusable element does not steal focus", async () => {
      const { user } = await open();
      const btn = screen.getByRole("button", { name: "Salvar progresso" });
      await user.click(btn);
      await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(btn);
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

  const deferred = () => {
    let resolve!: (v?: unknown) => void;
    const promise = new Promise((r) => (resolve = r));
    return { promise, resolve };
  };

  it("double click on Começar a ler este calls the API once", async () => {
    const d = deferred();
    vi.mocked(api.startFromDocument).mockReturnValue(d.promise as Promise<{ id: number }>);
    render(<Manage token="tok" />);
    const btn = await screen.findByRole("button", { name: "Começar a ler este" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(api.startFromDocument).toHaveBeenCalledTimes(1);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    d.resolve({ id: 5 });
  });

  it("double click on É este livro calls the API once", async () => {
    const d = deferred();
    vi.mocked(api.linkDocument).mockReturnValue(d.promise as Promise<void>);
    render(<Manage token="tok" />);
    await screen.findByText(/Messias de Duna/);
    const btn = (await screen.findAllByRole("button", { name: "É este livro" }))[1];
    await vi.waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(api.linkDocument).toHaveBeenCalledTimes(1);
    d.resolve();
  });

  it("double submit of Criar leitura, Salvar progresso and Salvar capa calls the API once", async () => {
    const d = deferred();
    vi.mocked(api.createReading).mockReturnValue(d.promise as Promise<unknown>);
    vi.mocked(api.postProgress).mockReturnValue(d.promise as Promise<unknown>);
    vi.mocked(api.setCover).mockReturnValue(d.promise as Promise<void>);
    render(<Manage token="tok" />);
    fireEvent.change(await screen.findByLabelText("Título"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Meu progresso (%)"), { target: { value: "10" } });
    await vi.waitFor(() =>
      expect((screen.getByRole("button", { name: "Salvar capa" }) as HTMLButtonElement).disabled).toBe(false),
    );
    for (const n of ["Criar leitura", "Salvar progresso", "Salvar capa"]) {
      const b = screen.getByRole("button", { name: n });
      fireEvent.click(b);
      fireEvent.click(b);
    }
    expect(api.createReading).toHaveBeenCalledTimes(1);
    expect(api.postProgress).toHaveBeenCalledTimes(1);
    expect(api.setCover).toHaveBeenCalledTimes(1);
    d.resolve({});
  });

  it("shows a field error for a 422 invalid cover URL", async () => {
    vi.mocked(api.setCover).mockRejectedValue(new api.HttpError(422));
    const user = userEvent.setup();
    render(<Manage token="tok" />);
    await user.type(await screen.findByLabelText("Nova URL da capa"), "http://x/y.jpg");
    await vi.waitFor(() =>
      expect((screen.getByRole("button", { name: "Salvar capa" }) as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Salvar capa" }));
    expect(await screen.findByText("URL inválida (use http ou https)")).toBeTruthy();
    expect(screen.queryByText(/Algo deu errado/)).toBeNull();
  });

  it("shows a field error for a 422 on create with a cover URL", async () => {
    vi.mocked(api.createReading).mockRejectedValue(
      new api.HttpError(422, "x", [{ loc: ["body", "cover_url"], msg: "bad", type: "value_error" }]),
    );
    const user = userEvent.setup();
    render(<Manage token="tok" />);
    await user.type(await screen.findByLabelText("Título"), "X");
    await user.type(screen.getByLabelText("URL da capa (opcional)"), "http://x/y.jpg");
    await user.click(screen.getByRole("button", { name: "Criar leitura" }));
    expect(await screen.findByText("URL inválida (use http ou https)")).toBeTruthy();
  });

  it("shows the generic error for a 422 on create not about cover_url", async () => {
    vi.mocked(api.createReading).mockRejectedValue(
      new api.HttpError(422, "x", [{ loc: ["body", "title"], msg: "bad", type: "value_error" }]),
    );
    const user = userEvent.setup();
    render(<Manage token="tok" />);
    await user.type(await screen.findByLabelText("Título"), "X");
    await user.type(screen.getByLabelText("URL da capa (opcional)"), "http://x/y.jpg");
    await user.click(screen.getByRole("button", { name: "Criar leitura" }));
    expect(await screen.findByText(/Algo deu errado/)).toBeTruthy();
    expect(screen.queryByText("URL inválida (use http ou https)")).toBeNull();
  });

  it("shows a specific error for 409 on Começar a ler este", async () => {
    vi.mocked(api.startFromDocument).mockRejectedValue(new api.HttpError(409, "x", "conflict"));
    const user = userEvent.setup();
    render(<Manage token="tok" />);
    const row = await docRow(/Messias de Duna/);
    await user.click(within(row).getByRole("button", { name: "Começar a ler este" }));
    const m = await screen.findByText("Esse documento já está ligado a uma leitura.");
    expect(m.className).toContain("danger");
    expect(screen.queryByText(/Algo deu errado/)).toBeNull();
  });

  it("Buscar capa opens the search modal and saves the picked cover", async () => {
    const user = userEvent.setup();
    render(<Manage token="tok" />);
    await user.click(await screen.findByRole("button", { name: "Buscar capa" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: /Usar capa: Duna/ }));
    expect(api.setCover).toHaveBeenCalledWith("tok", expect.any(Number), "https://covers.openlibrary.org/b/id/9-L.jpg");
    expect(await screen.findByText("Capa salva.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
