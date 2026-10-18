import { ML_PER_OZ } from "../lib/pour.ts";

export type Glass = {
  name: string;
  capacityMl: number;
  why: string;
};

const oz = (n: number) => n * ML_PER_OZ;

export const GLASSES = {
  rocks: {
    name: "Rocks",
    capacityMl: oz(10),
    why: "Short and wide with a heavy base: room for big ice and spirit-forward drinks served on the rocks.",
  },
  highball: {
    name: "Highball",
    capacityMl: oz(12),
    why: "Tall enough for a spirit plus a mixer over ice, so the bubbles last and the drink stays cold.",
  },
  collins: {
    name: "Collins",
    capacityMl: oz(14),
    why: "Taller and narrower than a highball, for sours topped with soda like the Tom Collins.",
  },
  coupe: {
    name: "Coupe",
    capacityMl: oz(6),
    why: "A shallow bowl on a stem for drinks served up (no ice); the stem keeps your hand from warming it.",
  },
  martini: {
    name: "Martini",
    capacityMl: oz(7),
    why: "The V-shaped bowl shows off a clear, stirred drink and holds a garnish at the surface.",
  },
  shot: {
    name: "Shot",
    capacityMl: oz(2),
    why: "Holds one straight pour, meant to be drunk in one go.",
  },
  mule: {
    name: "Copper mug",
    capacityMl: oz(14),
    why: "The Moscow Mule's mug: copper takes the ice's chill, so the drink and the mug stay ice cold.",
  },
} as const satisfies Record<string, Glass>;

export type GlassId = keyof typeof GLASSES;

export const GLASS_IDS = Object.keys(GLASSES) as GlassId[];

// A 28 oz shaker tin, which doubles as the mixing glass for stirred drinks.
export const SHAKER_CAPACITY_ML = oz(28);
