import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSummary } from "./test/fixtures";

vi.mock("./api/client", async (orig) => ({
  ...(await orig<typeof import("./api/client")>()),
  getSummary: vi.fn(),
  getSessions: vi.fn(),
  getUnlinked: vi.fn(),
  postProgress: vi.fn(),
  createReading: vi.fn(),
  linkDocument: vi.fn(),
}));

import * as api from "./api/client";
import App from "./App";

const KEY = "bookrats.token";

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.getSummary).mockReset().mockResolvedValue(makeSummary());
  vi.mocked(api.getSessions).mockReset().mockResolvedValue([]);
  vi.mocked(api.getUnlinked).mockReset().mockResolvedValue([]);
});

describe("App", () => {
  it("shows the token screen when no token is stored", () => {
    render(<App />);
    expect(screen.getByLabelText("Cole seu token")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
  });

  it("saves the token and shows the dashboard", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Cole seu token"), "secret");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(localStorage.getItem(KEY)).toBe("secret");
    expect(await screen.findByText(/Duna/)).toBeTruthy();
    expect(api.getSummary).toHaveBeenCalledWith("secret");
  });

  it("goes straight to the dashboard with a stored token and has tabs", async () => {
    localStorage.setItem(KEY, "stored");
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(/Duna/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Progresso" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Gerenciar" }));
    expect(await screen.findByLabelText("Meu progresso (%)")).toBeTruthy();
  });

  it("clears the token and returns to the token screen on AuthError", async () => {
    localStorage.setItem(KEY, "bad");
    vi.mocked(api.getSummary).mockRejectedValue(new api.AuthError());
    render(<App />);
    expect(await screen.findByLabelText("Cole seu token")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("has Progresso, Estante and Gerenciar tabs", async () => {
    localStorage.setItem(KEY, "secret");
    render(<App />);
    for (const n of ["Progresso", "Estante", "Gerenciar"]) expect(await screen.findByRole("button", { name: n })).toBeTruthy();
  });

  it("marks only the active tab with aria-current=page", async () => {
    localStorage.setItem(KEY, "secret");
    const user = userEvent.setup();
    render(<App />);
    const prog = await screen.findByRole("button", { name: "Progresso" });
    expect(prog.getAttribute("aria-current")).toBe("page");
    const shelf = screen.getByRole("button", { name: "Estante" });
    expect(shelf.getAttribute("aria-current")).toBeNull();
    await user.click(shelf);
    expect(shelf.getAttribute("aria-current")).toBe("page");
    expect(prog.getAttribute("aria-current")).toBeNull();
  });
});
