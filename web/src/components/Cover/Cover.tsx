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
  /** Fill the parent width (shelf tiles) instead of a fixed size. */
  fluid?: boolean;
}

export function Cover(props: Props) {
  return <CoverInner key={props.url ?? ""} {...props} />;
}

function CoverInner({ url, title, small, loading, fluid }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, []);
  const size = fluid
    ? "w-full rounded-card shadow-shelf"
    : small
      ? "w-16 rounded-control shadow-cover-sm"
      : "w-24 min-[420px]:w-28 min-[480px]:w-35 rounded-card shadow-cover";
  const cls = `cover flex-none aspect-[2/3] object-cover bg-track ${size}`;
  if (!url || failed) {
    const font = fluid ? "text-[1.6rem]" : small ? "text-[1.3rem]" : "text-[2.25rem] min-[480px]:text-[2.75rem]";
    return (
      <div
        className={`${cls} flex items-center justify-center text-accent-text font-semibold tracking-tight select-none ${font}`}
        data-testid="cover-placeholder"
        aria-hidden="true"
      >
        {initials(title)}
      </div>
    );
  }
  const img = (
    <img
      ref={ref}
      className={`${cls} block${loading ? (loaded ? " fade loaded" : " fade") : ""}`}
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
    <div className="cover-slot relative w-full" aria-busy={!loaded}>
      {img}
      {!loaded && (
        <div
          className="cover-loading shimmer absolute inset-0 flex items-center justify-center rounded-card bg-track pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          <span className="relative z-1 size-5 rounded-full border-2 border-muted border-r-transparent animate-spinner motion-reduce:animate-none" />
        </div>
      )}
    </div>
  );
}
