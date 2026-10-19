import { mlToOz } from "../lib/pour.ts";
import type { Contents } from "./drink.ts";
import { GLASSES } from "./glassware.ts";
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

// Professional mode: about 1 in 6 customers asks by flavor (bartender's
// choice), and about 1 in 6 forgot their drink's name and describes it, so the
// bartender has to work it out and make it from memory. Off: neither.
export const CHOICE_RATE = 1 / 6;
export const FORGOT_RATE = 1 / 6;
export type ProRequest = { kind: "flavor"; flavor: Flavor } | { kind: "forgot" } | null;

export function rollPro(enabled: boolean, pick = Math.random): ProRequest {
  if (!enabled) return null;
  const roll = pick();
  if (roll < CHOICE_RATE) return { kind: "flavor", flavor: FLAVORS[Math.floor(pick() * FLAVORS.length)] };
  if (roll < CHOICE_RATE + FORGOT_RATE) return { kind: "forgot" };
  return null;
}

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

// Names compared loosely: "Gin & Tonic" and "gin and tonic" are the same drink.
const plain = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Turns a written order into a forgot-the-name one: the classic's exact spec,
// hidden on the ticket. null: it isn't a classic, or the customer said the
// name anyway, so there's nothing to work out.
export function asForgot(order: Order): Order | null {
  const classic = CLASSIC_RECIPES.find((r) => plain(r.name) === plain(order.recipe.name));
  if (!classic || plain(order.line).includes(plain(classic.name))) return null;
  return { ...order, recipe: classic, special: [], mystery: true };
}

// How a classic-menu customer who forgot the name describes the drink: its
// spirit, its flavor and how it's served, never the name or the spec.
export function describeForgotten(recipe: Recipe): string {
  const spirit = recipe.ingredients.map((i) => INGREDIENTS[i.id]).find((i) => i.category === "spirit");
  const flavor = FLAVORS.find((f) => fits(f, recipe.name));
  const glass = GLASSES[recipe.glass].name.toLowerCase();
  return [
    `I can’t remember what it’s called. It’s made with ${spirit ? spirit.name.toLowerCase() : "liquor"}`,
    flavor ? `, it’s ${flavor}` : "",
    `, and it comes in a ${glass}${glass.endsWith("mug") ? "" : " glass"}${recipe.ice ? " over ice" : ""}.`,
  ].join("");
}
