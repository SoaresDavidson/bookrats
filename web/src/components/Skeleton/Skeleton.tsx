/** Pulsing placeholder block; size and shape come from the className. */
export function Skeleton({ className }: { className: string }) {
  return <div className={className} />;
}
