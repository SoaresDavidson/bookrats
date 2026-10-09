import { expect, it } from "vitest";
import { FALLBACK_COLORS } from "./client";

it("shared fallback reader colors use the palette values", () => {
  expect(FALLBACK_COLORS).toEqual([
    { id: "azul", light: "#2F6FEB", dark: "#6F9CF5" },
    { id: "laranja", light: "#D9480F", dark: "#FF8A4C" },
  ]);
});
