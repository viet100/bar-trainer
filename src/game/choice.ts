import { mlToOz } from "../lib/pour.ts";
import type { Contents } from "./drink.ts";
import { INGREDIENTS, type IngredientId } from "./ingredients.ts";
import type { Order } from "./order.ts";
import { CLASSIC_RECIPES, type Recipe } from "./recipes.ts";

// Bartender's choice: the customer names a flavor, not a drink, and the
// bartender picks a classic that fits. "Strong" is left out on purpose: the
// order checks reject customers asking for strong drinks.
export const FLAVOR_DRINKS = {
  bitter: ["Negroni", "Boulevardier"],
  sweet: ["Cosmopolitan", "White Russian", "Tequila Sunrise", "Lemon Drop", "Bee's Knees", "Gold Rush"],
  sour: ["Margarita", "Daiquiri", "Whiskey Sour", "Gimlet", "Lemon Drop", "Bee's Knees"],
  refreshing: ["Tom Collins", "Gin & Tonic", "Mojito", "Moscow Mule", "Paloma", "Cuba Libre", "Screwdriver", "Cape Codder"],
} as const satisfies Record<string, readonly string[]>;
export type Flavor = keyof typeof FLAVOR_DRINKS;
export const FLAVORS = Object.keys(FLAVOR_DRINKS) as Flavor[];
export const isFlavor = (v: unknown): v is Flavor => typeof v === "string" && Object.hasOwn(FLAVOR_DRINKS, v);

const fits = (flavor: Flavor, name: string) => (FLAVOR_DRINKS[flavor] as readonly string[]).includes(name);
export const flavorDrinks = (flavor: Flavor) => CLASSIC_RECIPES.filter((r) => fits(flavor, r.name));

// Points lost for making a drink that doesn't fit the flavor asked for.
export const CHOICE_PENALTY = 30;
const MIN_OVERLAP = 0.5;

// Ingredients actually in the glass: anything that shows as at least 0.01 oz,
// the same rounding the measurement uses.
export const pouredIds = (contents: Contents) =>
  (Object.entries(contents) as [IngredientId, number][]).filter(([, ml]) => Math.round(mlToOz(ml) * 100) > 0).map(([id]) => id);

// The same, from a measurement the browser sent: untrusted, so only known ids
// with a positive amount count.
export function pouredInMeasurement(raw: unknown): IngredientId[] {
  const list = (raw as { ingredients?: unknown } | null)?.ingredients;
  if (!Array.isArray(list)) return [];
  return list
    .filter((i): i is { id: IngredientId; actualOz: number } => typeof i?.id === "string" && Object.hasOwn(INGREDIENTS, i.id) && typeof i.actualOz === "number" && i.actualOz > 0)
    .map((i) => i.id);
}

// Which classic the bartender made, judged by the ingredients poured (not the
// amounts, so a sloppy pour still counts): the closest ingredient set, if it
// shares at least half of the combined ingredients.
export function identifyClassic(poured: IngredientId[]): Recipe | null {
  let best: Recipe | null = null;
  let bestOverlap = 0;
  for (const r of CLASSIC_RECIPES) {
    const ids = r.ingredients.map((i) => i.id);
    const shared = ids.filter((id) => poured.includes(id)).length;
    const overlap = shared / new Set([...ids, ...poured]).size;
    if (overlap > bestOverlap) [best, bestOverlap] = [r, overlap];
  }
  return bestOverlap >= MIN_OVERLAP ? best : null;
}

export type ChoiceResult = { asked: Flavor; made: string | null; fits: boolean };

// The spec a drink is graded against. A normal order: its own recipe. A
// bartender's-choice order: the classic the bartender made, plus whether it
// fits the flavor; if it's no recognizable classic, the order's example spec.
export function gradeTarget(order: Order, poured: IngredientId[]): { recipe: Recipe; choice: ChoiceResult | null } {
  if (!order.choice) return { recipe: order.recipe, choice: null };
  const made = identifyClassic(poured);
  return {
    recipe: made ?? order.recipe,
    choice: { asked: order.choice, made: made?.name ?? null, fits: made !== null && fits(order.choice, made.name) },
  };
}

// Turns a written order into a bartender's-choice one: the customer's words
// stay, and the example spec is swapped for a fitting classic if needed.
export function asChoice(order: Order, flavor: Flavor, pick = Math.random): Order {
  const options = flavorDrinks(flavor);
  const recipe = fits(flavor, order.recipe.name) ? order.recipe : options[Math.floor(pick() * options.length)];
  return { ...order, recipe, special: [], choice: flavor };
}
