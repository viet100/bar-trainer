import { GLASSES, SHAKER_CAPACITY_ML, type GlassId } from "./glassware.ts";
import type { GarnishId, IngredientId } from "./ingredients.ts";

// ml per ingredient, keys kept in first-pour order
export type Contents = Partial<Record<IngredientId, number>>;

export type Vessel = { contents: Contents; ice: number };

export type VesselId = "glass" | "shaker";

// How a shaker batch was mixed. Raw facts only; judging them is Gemini's job.
export type Mix = { shakeMs: number; stirMs: number; withIce: boolean };

export type DrinkState = {
  glass: GlassId | null;
  inGlass: Vessel;
  inShaker: Vessel;
  shakerMix: Mix; // the batch currently in the shaker
  strainedMix: Mix | null; // what was strained into the glass, if anything
  garnish: GarnishId | null;
  spilledMl: number;
  // Boston shaker: the small tin sits upside down in the big one. You can only
  // shake it capped, and only pour in, add ice, stir or strain with it open.
  shakerCapped: boolean;
};

export type DrinkAction =
  | { type: "selectGlass"; glass: GlassId }
  | { type: "pour"; into: VesselId; ingredient: IngredientId; ml: number }
  | { type: "addIce"; into: VesselId; cubes: number }
  | { type: "shake"; ms: number }
  | { type: "stir"; ms: number }
  | { type: "strain" }
  | { type: "garnish"; garnish: GarnishId }
  | { type: "dump"; vessel: VesselId }
  | { type: "capShaker" }
  | { type: "uncapShaker" }
  | { type: "reset" };

// Volume one standard 1" cube displaces.
export const ICE_CUBE_ML = 20;

const EMPTY_VESSEL: Vessel = { contents: {}, ice: 0 };
const NO_MIX: Mix = { shakeMs: 0, stirMs: 0, withIce: false };

export const INITIAL_DRINK: DrinkState = {
  glass: null,
  inGlass: EMPTY_VESSEL,
  inShaker: EMPTY_VESSEL,
  shakerMix: NO_MIX,
  strainedMix: null,
  garnish: null,
  spilledMl: 0,
  shakerCapped: false,
};

export const liquidMl = (v: Vessel) =>
  Object.values(v.contents).reduce((sum, ml) => sum + (ml ?? 0), 0);

export const capacityMl = (state: DrinkState, vessel: VesselId) =>
  vessel === "shaker" ? SHAKER_CAPACITY_ML : state.glass ? GLASSES[state.glass].capacityMl : 0;

const roomMl = (v: Vessel, capacity: number) =>
  Math.max(0, capacity - liquidMl(v) - v.ice * ICE_CUBE_ML);

const vesselKey = (vessel: VesselId) => (vessel === "glass" ? "inGlass" : "inShaker");

// Adds liquid up to the vessel's room, scaling every ingredient down evenly on overflow.
function fill(v: Vessel, add: Contents, capacity: number): { vessel: Vessel; spilled: number } {
  const total = liquidMl({ contents: add, ice: 0 });
  const kept = total > 0 ? Math.min(1, roomMl(v, capacity) / total) : 0;
  const contents = { ...v.contents };
  for (const [id, ml] of Object.entries(add) as [IngredientId, number][]) {
    if (ml * kept > 0) contents[id] = (contents[id] ?? 0) + ml * kept;
  }
  return { vessel: { ...v, contents }, spilled: total * (1 - kept) };
}

export function drinkReducer(state: DrinkState, action: DrinkAction): DrinkState {
  switch (action.type) {
    case "selectGlass": {
      const glassInUse = liquidMl(state.inGlass) > 0 || state.inGlass.ice > 0;
      return glassInUse ? state : { ...state, glass: action.glass };
    }

    case "pour": {
      if (action.ml <= 0) return state;
      if (action.into === "shaker" && state.shakerCapped) {
        return { ...state, spilledMl: state.spilledMl + action.ml }; // runs off the capped tin
      }
      const key = vesselKey(action.into);
      const { vessel, spilled } = fill(
        state[key],
        { [action.ingredient]: action.ml },
        capacityMl(state, action.into),
      );
      return { ...state, [key]: vessel, spilledMl: state.spilledMl + spilled };
    }

    case "addIce": {
      if (action.into === "shaker" && state.shakerCapped) return state;
      const key = vesselKey(action.into);
      const v = state[key];
      const fits = Math.floor(roomMl(v, capacityMl(state, action.into)) / ICE_CUBE_ML);
      const cubes = Math.min(action.cubes, fits);
      return cubes > 0 ? { ...state, [key]: { ...v, ice: v.ice + cubes } } : state;
    }

    case "shake":
    case "stir": {
      if (liquidMl(state.inShaker) === 0) return state;
      if ((action.type === "shake") !== state.shakerCapped) return state; // shake capped, stir open
      const mix = state.shakerMix;
      return {
        ...state,
        shakerMix: {
          shakeMs: mix.shakeMs + (action.type === "shake" ? action.ms : 0),
          stirMs: mix.stirMs + (action.type === "stir" ? action.ms : 0),
          withIce: mix.withIce || state.inShaker.ice > 0,
        },
      };
    }

    case "strain": {
      // Ice stays behind in the tin; only liquid passes the strainer.
      if (liquidMl(state.inShaker) === 0 || state.shakerCapped) return state;
      const { vessel, spilled } = fill(state.inGlass, state.inShaker.contents, capacityMl(state, "glass"));
      const prev = state.strainedMix;
      const mix = state.shakerMix;
      return {
        ...state,
        inGlass: vessel,
        inShaker: EMPTY_VESSEL,
        shakerMix: NO_MIX,
        strainedMix: prev
          ? {
              shakeMs: prev.shakeMs + mix.shakeMs,
              stirMs: prev.stirMs + mix.stirMs,
              withIce: prev.withIce || mix.withIce,
            }
          : mix,
        spilledMl: state.spilledMl + spilled,
      };
    }

    case "garnish":
      return state.glass ? { ...state, garnish: action.garnish } : state;

    case "dump":
      return action.vessel === "glass"
        ? { ...state, inGlass: EMPTY_VESSEL, strainedMix: null, garnish: null }
        : { ...state, inShaker: EMPTY_VESSEL, shakerMix: NO_MIX, shakerCapped: false };

    case "capShaker":
    case "uncapShaker":
      return { ...state, shakerCapped: action.type === "capShaker" };

    case "reset":
      return INITIAL_DRINK;
  }
}
