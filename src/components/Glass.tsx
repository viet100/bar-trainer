type GlassProps = {
  contents: Partial<Record<string, number>>;
  ice: number;
  capacityMl: number;
  colorOf: (id: string) => string;
  streamColor: string | null;
  targetMl?: number | null; // dashed line where the current pour should stop
};

// Sized by its parent so the same view works for glasses and the shaker tin.
export default function Glass({ contents, ice, capacityMl, colorOf, streamColor, targetMl }: GlassProps) {
  const totalMl = Object.values(contents).reduce((sum: number, ml) => sum + (ml ?? 0), 0);
  const fill = capacityMl > 0 ? Math.min(1, totalMl / capacityMl) : 0;

  return (
    <div className="relative h-full w-full">
      {/* Pour stream, drawn behind the liquid so it disappears into it */}
      <div
        className="absolute -top-16 bottom-2 left-1/2 w-1.5 -translate-x-1/2 rounded-full transition-opacity duration-100"
        style={{ backgroundColor: streamColor ?? "transparent", opacity: streamColor ? 0.9 : 0 }}
      />
      <div className="relative h-full overflow-hidden rounded-b-[2rem] border-x-4 border-b-4 border-white/30 bg-white/5">
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col-reverse transition-[height] duration-100 ease-linear"
          style={{ height: `${fill * 100}%` }}
        >
          {Object.entries(contents).map(([id, ml]) => (
            <div key={id} style={{ flex: `${ml} 1 0`, backgroundColor: colorOf(id) }} />
          ))}
        </div>
        {targetMl != null && capacityMl > 0 && (
          <div
            className="absolute inset-x-0 border-t-2 border-dashed border-amber-300/90 transition-[bottom] duration-200"
            style={{ bottom: `${Math.min(1, targetMl / capacityMl) * 100}%` }}
          />
        )}
        <div className="absolute inset-x-2 bottom-2 flex flex-wrap-reverse justify-center gap-1">
          {Array.from({ length: ice }, (_, i) => (
            <span key={i} className="size-4 rounded-[3px] border border-white/60 bg-white/35" />
          ))}
        </div>
      </div>
    </div>
  );
}
