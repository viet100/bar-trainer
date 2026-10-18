import type { GlassId } from "../../game/glassware.ts";

// A vessel's inside wall as [radius, height] points in meters, from the
// inner bottom up to the rim. Spinning it around the y axis (three's
// LatheGeometry) gives the 3D shape, and the same points give the volume
// at any fill height, so the liquid level matches the drink state exactly.
export type Profile = [r: number, y: number][];

export type VesselShape = {
  inner: Profile;
  wall: number; // glass thickness
  stem?: { top: number; footRadius: number }; // stemmed glasses: bowl sits on a stem of this height
};

export const SHAPES: Record<GlassId | "tin" | "smallTin", VesselShape> = {
  // Radii are sized so each shape holds the game's capacity (see the test).
  rocks: { inner: [[0, 0.009], [0.0337, 0.009], [0.0354, 0.088]], wall: 0.003 },
  highball: { inner: [[0, 0.01], [0.0277, 0.01], [0.0295, 0.148]], wall: 0.0025 },
  collins: { inner: [[0, 0.01], [0.028, 0.01], [0.029, 0.168]], wall: 0.0025 },
  coupe: {
    inner: [[0, 0.1], [0.019, 0.103], [0.0347, 0.114], [0.0434, 0.13], [0.0451, 0.142]],
    wall: 0.002,
    stem: { top: 0.1, footRadius: 0.034 },
  },
  martini: { inner: [[0, 0.098], [0.0069, 0.1], [0.0501, 0.168]], wall: 0.002, stem: { top: 0.098, footRadius: 0.036 } },
  shot: { inner: [[0, 0.012], [0.018, 0.012], [0.0208, 0.062]], wall: 0.003 },
  mule: { inner: [[0, 0.006], [0.0365, 0.006], [0.0385, 0.1]], wall: 0.002 }, // copper mug (handle added when drawn)
  // Drawn smaller than a real 28 oz tin so it doesn't tower over the glasses;
  // its fill level is a fraction of the game capacity, so it still reads right.
  tin: { inner: [[0, 0.004], [0.032, 0.004], [0.036, 0.15]], wall: 0.0012 },
  // The Boston shaker's small tin: its mouth fits just inside the big tin's.
  smallTin: { inner: [[0, 0.003], [0.026, 0.003], [0.0335, 0.11]], wall: 0.0012 },
};

// How far the small tin sits down inside the big one when capped.
export const CAP_INSET = 0.03;

const frustum = (r1: number, r2: number, h: number) => (Math.PI * h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3;

// Radius of the inside wall at height y (clamped to the profile).
export function radiusAt(p: Profile, y: number): number {
  let r = p[0][0];
  for (let i = 1; i < p.length; i++) {
    const [r0, y0] = p[i - 1];
    const [r1, y1] = p[i];
    if (y1 === y0) {
      if (y >= y0) r = r1; // a flat bottom: the wall starts at its outer edge
      continue;
    }
    if (y <= y0) break;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    r = r1;
  }
  return r;
}

// Volume (m³) inside the profile from its bottom up to height y.
export function volumeTo(p: Profile, y: number): number {
  let v = 0;
  for (let i = 1; i < p.length; i++) {
    const [r0, y0] = p[i - 1];
    if (p[i][1] === y0) continue; // flat bottom holds no volume
    if (y <= y0) break;
    const y1 = Math.min(p[i][1], y);
    v += frustum(r0, radiusAt(p, y1), y1 - y0);
  }
  return v;
}

export const rimHeight = (p: Profile) => p[p.length - 1][1];

// Height the liquid reaches when the vessel is `fraction` full (0-1) by volume.
export function heightForFraction(p: Profile, fraction: number): number {
  const bottom = p[0][1];
  const rim = rimHeight(p);
  const target = Math.min(1, Math.max(0, fraction)) * volumeTo(p, rim);
  let lo = bottom;
  let hi = rim;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (volumeTo(p, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Closed outline of the liquid up to height h, ready for LatheGeometry:
// bottom center, along the wall, across the surface back to the axis.
export function liquidOutline(p: Profile, h: number, inset = 0.0006): Profile {
  const shrink = (r: number) => Math.max(0, r - inset); // keeps the liquid off the glass surface
  const wall = p.slice(1).filter(([, y]) => y < h).map(([r, y]): [number, number] => [shrink(r), y]);
  return [[0, p[0][1]], ...wall, [shrink(radiusAt(p, h)), h], [0, h]];
}

// Closed outline of the glass itself: outside wall up, over the rim, inside wall down.
export function glassOutline({ inner, wall, stem }: VesselShape): Profile {
  const baseY = stem ? inner[0][1] - wall : 0; // stemmed bowls sit on the stem; tumblers on the counter
  const outside: Profile = [[0, baseY]];
  for (let i = 1; i < inner.length; i++) {
    const [r, y] = inner[i];
    const flatBottom = i === 1 && y === inner[0][1];
    if (flatBottom) outside.push([r + wall, baseY]); // a solid base under a flat inside bottom
    outside.push([r + wall, y]);
  }
  const [rimR, rimY] = inner[inner.length - 1];
  return [...outside, [rimR + wall / 2, rimY + wall / 2], ...[...inner].reverse()];
}
