import type { GlassContents } from "@/hooks/usePourController";

type GlassProps = {
  contents: GlassContents;
  totalMl: number;
  capacityMl: number;
  colorOf: (id: string) => string;
  streamColor: string | null;
};

export default function Glass({ contents, totalMl, capacityMl, colorOf, streamColor }: GlassProps) {
  const fill = Math.min(1, totalMl / capacityMl);

  return (
    <div className="relative h-64 w-44">
      {/* Pour stream, drawn behind the liquid so it disappears into it */}
      <div
        className="absolute -top-20 bottom-2 left-1/2 w-1.5 -translate-x-1/2 rounded-full transition-opacity duration-100"
        style={{ backgroundColor: streamColor ?? "transparent", opacity: streamColor ? 0.9 : 0 }}
      />
      <div className="relative h-full overflow-hidden rounded-b-[2.5rem] border-x-4 border-b-4 border-white/30 bg-white/5 backdrop-blur-[1px]">
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col-reverse transition-[height] duration-100 ease-linear"
          style={{ height: `${fill * 100}%` }}
        >
          {Object.entries(contents).map(([id, ml]) => (
            <div key={id} style={{ flex: `${ml} 1 0`, backgroundColor: colorOf(id) }} />
          ))}
        </div>
      </div>
    </div>
  );
}
