import { expect, test } from "vitest";
import { ago, pct, sessionText } from "./format";

test("pct", () => { expect(pct(0.414)).toBe("41%"); expect(pct(null)).toBe("sem dados"); });
test("sessionText", () => expect(sessionText({ from: 0.34, to: 0.41 })).toBe("34% → 41%"));
test("ago", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  expect(ago("2026-10-08T11:55:00Z", now)).toBe("há 5 min");
  expect(ago("2026-10-08T09:00:00Z", now)).toBe("há 3 h");
  expect(ago("2026-10-06T12:00:00Z", now)).toBe("há 2 dias");
  expect(ago(null, now)).toBe("sem dados");
});
