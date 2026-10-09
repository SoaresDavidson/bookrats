/** Pulsing placeholder block; size and shape come from the className. */
export function Skeleton({ className }: { className: string }) {
  return <div className={`bg-track rounded-control animate-skeleton motion-reduce:animate-none ${className}`} />;
}

/** Skeleton for the progress view. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3.5" role="status" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-[30px] w-[60%]" />
      <Skeleton className="h-[90px] rounded-card" />
      <Skeleton className="h-3.5 rounded-full" />
    </div>
  );
}

/** Skeleton for one shelf tile (cover, title, chip). The tile class is a test marker. */
export function ShelfTileSkeleton() {
  return (
    <>
      <div className="shelf-skel-tile shimmer relative overflow-hidden w-full aspect-[2/3] rounded-card bg-track" />
      <div className="h-3 w-[70%] mt-2 rounded-full bg-track" />
      <div className="h-[18px] w-[44%] mt-1.5 rounded-full bg-track" />
    </>
  );
}
