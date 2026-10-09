import type { Reader } from "../api/types";
import { FALLBACK_COLORS } from "../api/client";

/** Inline CSS variables carrying a reader's light and dark colors. */
export function readerVars(r: Reader, i: number): React.CSSProperties {
  const c = r.color ?? FALLBACK_COLORS[i % 2];
  return { ["--c-light" as string]: c.light, ["--c-dark" as string]: c.dark };
}
