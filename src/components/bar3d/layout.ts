import type { VesselId } from "../../game/drink.ts";
import type { GlassId } from "../../game/glassware.ts";
import {
  GARNISHES,
  INGREDIENT_IDS,
  INGREDIENTS,
  type GarnishId,
  type IngredientCategory,
  type IngredientId,
} from "../../game/ingredients.ts";

// A real bar station, in meters, seen from where the bartender stands (+z).
// The underbar (ice well, speed rail, tins, sink) is at waist height, y = 0.
// Behind it the bar top rises to BAR_TOP; the bar mat sits on it and the glass
// is built there, facing the customer. The camera never moves, so these are
// also the spots the drag logic aims at.
export type XZ = [x: number, z: number];
export type Spot = [x: number, y: number, z: number];

export const BAR_TOP = 0.26; // height of the bar top above the underbar
export const BAR_TOP_FRONT = -0.17; // its edge on the bartender's side
export const BAR_TOP_BACK = -0.47;

export const CAMERA = { position: [0, 0.82, 0.6] as const, target: [0, 0.06, -0.14] as const, fov: 52 };

export const MAT: Spot = [0, BAR_TOP, -0.31]; // the glass you're building sits here
export const MAT_SIZE: XZ = [0.44, 0.13];
export const ICE_WELL: Spot = [-0.03, 0, 0.0];
export const ICE_WELL_SIZE: XZ = [0.4, 0.22];
export const GARNISH_TRAY: Spot = [-0.37, 0, 0.0];
export const TIN: Spot = [0.25, 0, -0.02]; // Boston shaker on the drainboard: the big tin...
export const CAP_HOME: Spot = [0.35, 0, -0.04]; // ...and the small tin that caps it
export const SINK: Spot = [0.37, 0, 0.09];
// Two-tier speed rail, like a busy well: liquor on the back rail, and a lower
// rail in front for juices, syrups, cream and mixers.
export type Rail = { z: number; baseY: number; categories: IngredientCategory[] };
export const RAILS: Rail[] = [
  { z: 0.17, baseY: -0.24, categories: ["spirit", "liqueur"] },
  { z: 0.235, baseY: -0.31, categories: ["juice", "syrup", "dairy", "mixer"] },
];

export const VESSEL_SPOT: Record<VesselId, Spot> = { glass: MAT, shaker: TIN };
export const xz = (s: Spot | readonly [number, number, number]): XZ => [s[0], s[2]];

// How high a held thing rises. Ice and garnish snap to the cursor and float
// at CARRY_Y, above both counters, so they never sink into the bar top.
export const LIFT = { bottle: 0.22, item: 0.04 };
export const CARRY_Y = BAR_TOP + 0.06;

// How close (in meters, across the counter) a drop on the tin has to land.
export const DROP_RADIUS = 0.075;

// Dropping on the mat counts anywhere over the mat you can see, plus a small margin.
const MAT_MARGIN = 0.03;
export const onMat = ([x, z]: XZ) =>
  Math.abs(x - MAT[0]) <= MAT_SIZE[0] / 2 + MAT_MARGIN && Math.abs(z - MAT[2]) <= MAT_SIZE[1] / 2 + MAT_MARGIN;

// A carried bottle has to clear the bar top's edge. Its lowest allowed height
// ramps up smoothly over this distance in front of the edge instead of jumping.
const EDGE_RAMP = 0.14;
const EDGE_CLEARANCE = 0.02;
export function clearHeight(z: number, y: number) {
  const t = Math.min(1, Math.max(0, (BAR_TOP_FRONT + EDGE_RAMP - z) / EDGE_RAMP));
  const floor = (BAR_TOP + EDGE_CLEARANCE) * t * t * (3 - 2 * t);
  return Math.max(y, floor);
}

// Each rail holds its categories left to right, with a small gap between them.
const BOTTLE_SPACING = 0.054;
const CATEGORY_GAP = 0.022;

const BOTTLE_SLOTS = new Map<IngredientId, Spot>();
for (const rail of RAILS) {
  const xs: [IngredientId, number][] = [];
  let x = 0;
  rail.categories.forEach((cat, c) => {
    if (c > 0) x += CATEGORY_GAP;
    for (const id of INGREDIENT_IDS.filter((i) => INGREDIENTS[i].category === cat)) {
      xs.push([id, x]);
      x += BOTTLE_SPACING;
    }
  });
  const center = (x - BOTTLE_SPACING) / 2;
  for (const [id, bx] of xs) BOTTLE_SLOTS.set(id, [bx - center, rail.baseY, rail.z]);
}
export const bottleHome = (id: IngredientId): Spot => BOTTLE_SLOTS.get(id)!;

// A held bottle tips more as the cursor nears a vessel's opening, and pours
// once it's close enough. Distance is from where the cursor points at the
// vessel's rim height to the vessel's center: reach 0 at POUR_OUTER, 1 at
// POUR_INNER or closer. Pouring starts at about 13 cm.
export const POUR_OUTER = 0.26;
export const POUR_INNER = 0.1;
export const POUR_AT = 0.8; // reach needed to start pouring
export const pourReach = (d: number) => Math.min(1, Math.max(0, (POUR_OUTER - d) / (POUR_OUTER - POUR_INNER)));

// Glassware on the bar top, left of the mat: tall glasses in the back row so
// they never hide the short ones, all clear of the mat's left edge.
const RACK: Record<GlassId, XZ> = {
  collins: [-0.53, -0.41],
  highball: [-0.45, -0.41],
  martini: [-0.36, -0.41],
  rocks: [-0.54, -0.26],
  mule: [-0.45, -0.26],
  coupe: [-0.35, -0.26],
  shot: [-0.27, -0.25],
};
export const glassHome = (id: GlassId): Spot => [RACK[id][0], BAR_TOP, RACK[id][1]];

export const GARNISH_IDS = Object.keys(GARNISHES) as GarnishId[];
export const GARNISH_Y = 0.018; // garnishes sit in the tray's cups
// Garnish cups in two columns, centered on the caddy.
const CUP_SPACING: XZ = [0.05, 0.055];
export const garnishHome = (id: GarnishId): Spot => {
  const i = GARNISH_IDS.indexOf(id);
  const rows = Math.ceil(GARNISH_IDS.length / 2);
  return [
    GARNISH_TRAY[0] + ((i % 2) - 0.5) * CUP_SPACING[0],
    GARNISH_Y,
    GARNISH_TRAY[2] + (Math.floor(i / 2) - (rows - 1) / 2) * CUP_SPACING[1],
  ];
};

export const distance = ([ax, az]: XZ, [bx, bz]: XZ) => Math.hypot(ax - bx, az - bz);
