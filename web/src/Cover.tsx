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
  loading?: boolean;
}

export function Cover({ url, title, small, loading }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [url]);
  const cls = small ? "cover small" : "cover";
  if (!url || failed)
    return (
      <div className={cls + " placeholder"} data-testid="cover-placeholder" aria-hidden="true">
        {initials(title)}
      </div>
    );
  const img = (
    <img
      className={cls + (loading ? (loaded ? " fade loaded" : " fade") : "")}
      src={url}
      alt={title}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
  if (!loading) return img;
  return (
    <div className="cover-slot">
      {img}
      {!loaded && (
        <div className="cover-loading" role="status" aria-label="Carregando capa">
          <span className="spinner" />
        </div>
      )}
    </div>
  );
}
