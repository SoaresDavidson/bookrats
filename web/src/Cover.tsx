import { useEffect, useState } from "react";

export function initials(title: string): string {
  const words = title.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const letters = words.slice(0, 2).map((w) => (w.match(/\p{L}/u) as RegExpMatchArray)[0]);
  return letters.join("").toUpperCase() || "?";
}

interface Props {
  url: string | null;
  title: string;
  small?: boolean;
}

export function Cover({ url, title, small }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const cls = small ? "cover small" : "cover";
  if (!url || failed)
    return (
      <div className={cls + " placeholder"} data-testid="cover-placeholder" aria-hidden="true">
        {initials(title)}
      </div>
    );
  return (
    <img
      className={cls}
      src={url}
      alt={title}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
