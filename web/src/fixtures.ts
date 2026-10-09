import type { Summary } from "./api";

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

export function makeSummary(cover_url: string | null = null): Summary {
  return {
    reading: { id: 1, title: "Duna", author: "Frank Herbert", cover_url },
    me: "Davi",
    readers: [
      {
        name: "Davi",
        percentage: 0.41,
        updated_at: iso(5 * 60000),
        source: "kosync",
        last_session: { from: 0.34, to: 0.41, started_at: iso(30 * 60000), ended_at: iso(5 * 60000) },
      },
      { name: "Colega", percentage: null, updated_at: null, source: null, last_session: null },
    ],
  };
}
