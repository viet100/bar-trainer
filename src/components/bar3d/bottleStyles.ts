import type { IngredientId } from "../../game/ingredients.ts";
import type { Profile } from "./shapes.ts";

// How each bottle on the speed rail looks, modeled on a real well: liquor in
// glass bottles of different shapes with steel speed pourers, fresh juice and
// syrup in plastic squeeze bottles with colored pour tips, and mixers in small
// glass bottles. Each bottle is a shell (inside profile + wall) with liquid in
// it, so you see the spirit through the glass.

export type BottleShape = {
  inner: Profile; // inside wall, bottom to mouth, in meters
  wall: number;
  segments: number; // 4 makes a square bottle out of the same lathe
};

export type Pourer = { kind: "steel" } | { kind: "tip"; color: string };

export type BottleStyle = {
  shape: BottleShape;
  glass: { color: string; opacity: number; roughness: number }; // the bottle itself
  pourer: Pourer;
  fill: number; // how full, 0-1 of the body: bars run partly used bottles
};

export const POURER_HEIGHT = 0.018;

const SHAPES = {
  // Tall and round: most vodkas and rums
  tall: {
    inner: [[0, 0.006], [0.024, 0.006], [0.025, 0.17], [0.019, 0.2], [0.0092, 0.216], [0.0092, 0.262]],
    wall: 0.003,
    segments: 40,
  },
  // Short, heavy base with a long neck: a lot of tequila bottles
  squat: {
    inner: [[0, 0.014], [0.029, 0.014], [0.03, 0.115], [0.02, 0.14], [0.0092, 0.158], [0.0092, 0.236]],
    wall: 0.004,
    segments: 40,
  },
  // Square shoulders: gins and some orange liqueurs
  square: {
    inner: [[0, 0.006], [0.03, 0.006], [0.03, 0.155], [0.013, 0.19], [0.0092, 0.2], [0.0092, 0.24]],
    wall: 0.003,
    segments: 4,
  },
  // Long sloping shoulders, like a wine bottle: vermouths
  wine: {
    inner: [[0, 0.008], [0.025, 0.008], [0.025, 0.165], [0.012, 0.215], [0.0092, 0.23], [0.0092, 0.275]],
    wall: 0.003,
    segments: 40,
  },
  // Plastic squeeze bottle for fresh juice and syrup
  squeeze: {
    inner: [[0, 0.004], [0.027, 0.004], [0.027, 0.165], [0.022, 0.182], [0.008, 0.2]],
    wall: 0.0018,
    segments: 36,
  },
  // Small mixer bottle
  mixer: {
    inner: [[0, 0.005], [0.022, 0.005], [0.022, 0.11], [0.013, 0.145], [0.0092, 0.16], [0.0092, 0.19]],
    wall: 0.0025,
    segments: 36,
  },
} as const satisfies Record<string, BottleShape>;

const clearGlass = { color: "#e8f1f4", opacity: 0.22, roughness: 0.04 };
const plastic = { color: "#f3f1ea", opacity: 0.55, roughness: 0.55 };
const steel: Pourer = { kind: "steel" };

export const BOTTLE_STYLES: Record<IngredientId, BottleStyle> = {
  tequila: { shape: SHAPES.squat, glass: clearGlass, pourer: steel, fill: 0.62 },
  vodka: { shape: SHAPES.tall, glass: clearGlass, pourer: steel, fill: 0.8 },
  gin: { shape: SHAPES.square, glass: { color: "#bfe6dc", opacity: 0.32, roughness: 0.05 }, pourer: steel, fill: 0.55 },
  "white-rum": { shape: SHAPES.tall, glass: clearGlass, pourer: steel, fill: 0.7 },
  bourbon: { shape: SHAPES.squat, glass: clearGlass, pourer: steel, fill: 0.58 },
  "triple-sec": { shape: SHAPES.square, glass: { color: "#d9902f", opacity: 0.4, roughness: 0.06 }, pourer: steel, fill: 0.75 },
  "dry-vermouth": { shape: SHAPES.wine, glass: { color: "#3d6b3a", opacity: 0.6, roughness: 0.08 }, pourer: steel, fill: 0.5 },
  "sweet-vermouth": { shape: SHAPES.wine, glass: { color: "#4a2a1a", opacity: 0.55, roughness: 0.08 }, pourer: steel, fill: 0.65 },
  campari: { shape: SHAPES.tall, glass: clearGlass, pourer: steel, fill: 0.45 },
  "coffee-liqueur": { shape: SHAPES.squat, glass: { color: "#2a1a10", opacity: 0.65, roughness: 0.08 }, pourer: steel, fill: 0.7 },
  "lime-juice": { shape: SHAPES.squeeze, glass: plastic, pourer: { kind: "tip", color: "#5fb336" }, fill: 0.7 },
  "lemon-juice": { shape: SHAPES.squeeze, glass: plastic, pourer: { kind: "tip", color: "#f2cc2e" }, fill: 0.6 },
  cranberry: { shape: SHAPES.squeeze, glass: plastic, pourer: { kind: "tip", color: "#c0283a" }, fill: 0.78 },
  "orange-juice": { shape: SHAPES.squeeze, glass: plastic, pourer: { kind: "tip", color: "#f08a1c" }, fill: 0.72 },
  "grapefruit-juice": { shape: SHAPES.squeeze, glass: plastic, pourer: { kind: "tip", color: "#e96a7a" }, fill: 0.55 },
  "simple-syrup": { shape: SHAPES.squeeze, glass: plastic, pourer: { kind: "tip", color: "#3a7bd5" }, fill: 0.66 },
  "honey-syrup": { shape: SHAPES.squeeze, glass: plastic, pourer: { kind: "tip", color: "#d99a1e" }, fill: 0.5 },
  grenadine: { shape: SHAPES.squeeze, glass: plastic, pourer: { kind: "tip", color: "#7a0f1f" }, fill: 0.6 },
  "soda-water": { shape: SHAPES.mixer, glass: clearGlass, pourer: steel, fill: 0.85 },
  tonic: { shape: SHAPES.mixer, glass: { color: "#cfe8c8", opacity: 0.3, roughness: 0.05 }, pourer: steel, fill: 0.8 },
  cola: { shape: SHAPES.mixer, glass: { color: "#5a3115", opacity: 0.7, roughness: 0.06 }, pourer: steel, fill: 0.75 },
  "ginger-beer": { shape: SHAPES.mixer, glass: { color: "#6b4a22", opacity: 0.55, roughness: 0.06 }, pourer: steel, fill: 0.7 },
  "heavy-cream": { shape: SHAPES.squeeze, glass: plastic, pourer: { kind: "tip", color: "#e8edf2" }, fill: 0.62 },
};

const mouthOf = (shape: BottleShape) => shape.inner[shape.inner.length - 1][1];
// Top of the pourer, in the bottle's own frame: where the stream starts.
export const spoutHeight = (style: BottleStyle) => mouthOf(style.shape) + POURER_HEIGHT;
// Where the liquid inside stops: `fill` of the way up the body (below the neck).
export const liquidHeight = (style: BottleStyle) => {
  const body = style.shape.inner.find(([r], i) => i > 1 && r < style.shape.inner[1][0] * 0.9)?.[1] ?? mouthOf(style.shape);
  const bottom = style.shape.inner[0][1];
  return bottom + (body - bottom) * style.fill;
};
