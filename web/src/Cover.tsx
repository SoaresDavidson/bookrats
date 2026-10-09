import { useLayoutEffect, useRef, useState } from "react";

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

export function Cover(props: Props) {
  return <CoverInner key={props.url ?? ""} {...props} />;
}

function CoverInner({ url, title, small, loading }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
  }, []);
  const cls = small ? "cover small" : "cover";
  if (!url || failed)
    return (
      <div className={cls + " placeholder"} data-testid="cover-placeholder" aria-hidden="true">
        {initials(title)}
      </div>
    );
  const img = (
    <img
      ref={ref}
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
    <div className="cover-slot" aria-busy={!loaded}>
      {img}
      {!loaded && (
        <div className="cover-loading" aria-hidden="true">
          <span className="spinner" />
        </div>
      )}
    </div>
  );
}
