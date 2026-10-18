// Starting layout for the ice in the well, before physics settles it.
//
// Cubes are stacked in layers on a grid whose spacing is a cube's full
// diagonal, so no two can touch at any rotation: physics never starts with
// cubes stuck inside each other. Each layer is shifted half a cell from the
// one below, and every cube gets a random tilt, so once they drop and settle
// the heap looks natural.

// The ice well's tub and its ice. Shared by the game and scripts/settle-ice.mjs,
// which settles this ice once with physics and saves where every cube lands.
export const ICE_TUB = { depth: 0.12, cubeSize: 0.019, count: 1300 } as const;

export type IceCubePlacement = {
  position: [number, number, number];
  rotation: [number, number, number];
};

type Tub = { width: number; depth: number; floorY: number };

// Small seeded random generator (mulberry32), so the heap looks the same every load.
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const iceSpacing = (size: number) => size * Math.sqrt(3) * 1.02; // full diagonal plus a hair

export function stackIce(tub: Tub, size: number, count: number, seed = 1957): IceCubePlacement[] {
  const rand = seeded(seed);
  const step = iceSpacing(size);
  const out: IceCubePlacement[] = [];
  for (let layer = 0; out.length < count; layer++) {
    const shift = layer % 2 ? step / 2 : 0;
    const cols = Math.floor((tub.width - step - shift) / step) + 1;
    const rows = Math.floor((tub.depth - step - shift) / step) + 1;
    const y = tub.floorY + step / 2 + layer * step;
    for (let r = 0; r < rows && out.length < count; r++) {
      for (let c = 0; c < cols && out.length < count; c++) {
        out.push({
          position: [-tub.width / 2 + step / 2 + shift + c * step, y, -tub.depth / 2 + step / 2 + shift + r * step],
          rotation: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI],
        });
      }
    }
  }
  return out;
}
