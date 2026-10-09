import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import App from "./App";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);
jest.mock("react-native-android-widget", () => ({
  requestWidgetUpdate: jest.fn(async () => undefined),
  FlexWidget: () => null,
  TextWidget: () => null,
}));

const FAIL = "Não foi possível concluir. Tente de novo.";
const realFetch = globalThis.fetch;

beforeEach(() => {
  jest.mocked(SecureStore.getItemAsync).mockReset().mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockReset().mockResolvedValue(undefined);
  globalThis.fetch = realFetch;
});

test("loads saved url and token on mount", async () => {
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (k: string) => (k === "bookrats.url" ? "https://b.example" : "tok"));
  await render(<App />);
  expect(await screen.findByDisplayValue("https://b.example")).toBeOnTheScreen();
});

test("failed initial read shows the error message", async () => {
  jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error("keystore"));
  await render(<App />);
  expect(await screen.findByText(FAIL)).toBeOnTheScreen();
});

test("save trims fields and confirms", async () => {
  await render(<App />);
  await fireEvent.changeText(screen.getByLabelText("Endereço do servidor"), "  https://b.example ");
  await fireEvent.changeText(screen.getByLabelText("Token"), " tok ");
  await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText("Salvo.")).toBeOnTheScreen();
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("bookrats.url", "https://b.example");
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("bookrats.token", "tok");
});

test("failed save shows the error message and re-enables buttons", async () => {
  jest.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error("keystore"));
  await render(<App />);
  await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText(FAIL)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
});

test("test with rejected token reports it", async () => {
  globalThis.fetch = (async () => ({ status: 401, ok: false })) as unknown as typeof fetch;
  await render(<App />);
  await fireEvent.press(screen.getByRole("button", { name: "Testar" }));
  expect(await screen.findByText("Token inválido")).toBeOnTheScreen();
});
