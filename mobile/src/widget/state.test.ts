import { describe, expect, test } from "vitest";
import type { Summary } from "../api";
import { READER_COLORS, toWidgetState } from "./state";

const now = new Date("2026-10-08T12:00:00Z");

function summary(readers: unknown[], reading: Summary["reading"] = { id: 1, title: "Dune", author: "FH" }): Summary {
  return { reading, me: "a", readers } as unknown as Summary;
}

const reader = (name: string, percentage: number | null, extra: object = {}) => ({
  name,
  percentage,
  last_session: percentage === null ? null : { from: 0.34, to: percentage },
  updated_at: percentage === null ? null : "2026-10-08T11:55:00Z",
  source: percentage === null ? null : "kosync",
  ...extra,
});

const full = summary([reader("ana", 0.41), reader("bia", 0.6)]);

describe("toWidgetState", () => {
  test("colors", () => expect(READER_COLORS).toEqual(["#2F6FEB", "#E8590C"]));

  test("ok -> data", () => {
    const s = toWidgetState({ kind: "ok", summary: full }, null, now);
    expect(s).toMatchObject({ kind: "data", title: "Dune", stale: false });
    if (s.kind !== "data") throw new Error();
    expect(s.readers.map((r) => r.name)).toEqual(["ana", "bia"]);
    expect(s.readers.map((r) => r.color)).toEqual(["#2F6FEB", "#E8590C"]);
    expect(s.readers[0]).toMatchObject({ pct: "41%", fill: 0.41, session: "34% → 41%", ago: "há 5 min" });
  });

  test("no reading", () => {
    const s = toWidgetState({ kind: "ok", summary: summary([], null) }, null, now);
    expect(s).toEqual({ kind: "message", text: "Nenhuma leitura ativa" });
  });

  test("null percentage", () => {
    const s = toWidgetState({ kind: "ok", summary: summary([reader("ana", null)]) }, null, now);
    if (s.kind !== "data") throw new Error();
    expect(s.readers[0]).toMatchObject({ pct: "sem dados", fill: 0, session: "" });
  });

  test("fill clamped", () => {
    const s = toWidgetState({ kind: "ok", summary: summary([reader("a", 1.5), reader("b", -0.2)]) }, null, now);
    if (s.kind !== "data") throw new Error();
    expect(s.readers.map((r) => r.fill)).toEqual([1, 0]);
  });

  test("auth", () => {
    const m = { kind: "message", text: "token inválido" };
    expect(toWidgetState({ kind: "auth" }, null, now)).toEqual(m);
    expect(toWidgetState({ kind: "auth" }, full, now)).toEqual(m);
  });

  test("network with cache is stale", () => {
    const s = toWidgetState({ kind: "network" }, full, now);
    expect(s).toMatchObject({ kind: "data", title: "Dune", stale: true });
  });

  test("network without cache", () => {
    expect(toWidgetState({ kind: "network" }, null, now)).toEqual({ kind: "message", text: "Sem conexão" });
  });

  test("unconfigured", () => {
    expect(toWidgetState({ kind: "unconfigured" }, null, now)).toEqual({
      kind: "message",
      text: "Abra o app para configurar",
    });
  });
});
