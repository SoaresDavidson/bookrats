export interface ColorOption {
  id: string;
  hex?: string;
  label?: string;
  light: string;
  dark: string;
}

export interface SessionOut {
  from: number;
  to: number;
  started_at: string;
  ended_at: string;
}

export interface Reader {
  name: string;
  color: ColorOption;
  percentage: number | null;
  updated_at: string | null;
  source: string | null;
  last_session: SessionOut | null;
}

export interface Summary {
  reading: { id: number; title: string; author: string | null; cover_url: string | null } | null;
  me: string;
  readers: Reader[];
}

export interface UnlinkedDocument {
  hash: string;
  title: string | null;
  authors: string | null;
  last_device: string | null;
  first_seen: number;
}

export interface ReadingReader {
  name: string;
  percentage: number | null;
  updated_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface ReadingListItem {
  id: number;
  title: string;
  author: string | null;
  cover_url: string | null;
  goodreads_book_id: string | null;
  active: boolean;
  status: "lendo" | "lido" | "pausado";
  created_at: string;
  readers: ReadingReader[];
}

export interface CoverOption {
  url: string;
  title: string | null;
  author: string | null;
  source: "openlibrary" | "google";
}

export interface CoverSearchResult {
  results: CoverOption[];
  /** Sources that failed (down, rate-limited, no quota) and returned nothing. */
  unavailable: CoverOption["source"][];
}
