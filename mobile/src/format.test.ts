import { ago, leader, pct, sessionText } from "./format";

test("pct", () => {
  expect(pct(0.414)).toBe("41%");
  expect(pct(null)).toBe("sem dados");
});
test("sessionText", () => expect(sessionText({ from: 0.34, to: 0.41 })).toBe("34% → 41%"));
test("ago", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  expect(ago("2026-10-08T11:55:00Z", now)).toBe("há 5 min");
  expect(ago("2026-10-08T09:00:00Z", now)).toBe("há 3 h");
  expect(ago("2026-10-06T12:00:00Z", now)).toBe("há 2 dias");
  expect(ago(null, now)).toBe("sem dados");
});

test("ago edge cases", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  expect(ago("2026-10-07T12:00:00Z", now)).toBe("há 1 dia");
  expect(ago("not-a-date", now)).toBe("sem dados");
  expect(ago("2026-10-08T11:01:00Z", now)).toBe("há 59 min");
  expect(ago("2026-10-08T12:30:00Z", now)).toBe("há 0 min");
});

test("leader", () => {
  const r = (name: string, percentage: number | null) => ({ name, percentage });
  expect(leader([r("Davi", 0.42), r("Ana", 0.38)])).toBe("Davi");
  expect(leader([r("Davi", 0.3), r("Ana", 0.5)])).toBe("Ana");
  expect(leader([r("Davi", 0.421), r("Ana", 0.419)])).toBeNull();
  expect(leader([r("Davi", 0.4), r("Ana", null)])).toBeNull();
  expect(leader([r("Davi", 0.4)])).toBeNull();
});
