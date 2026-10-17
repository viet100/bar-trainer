import { ML_PER_OZ } from "../lib/pour.ts";
import { GLASSES, type GlassId } from "./glassware.ts";
import { GARNISHES, INGREDIENTS, type GarnishId, type IngredientId } from "./ingredients.ts";
import { CLASSIC_RECIPES, type Recipe, type Technique } from "./recipes.ts";

export type Customer = { name: string; age: number; vibe: string };

export type Order = {
  customer: Customer;
  line: string; // what the customer says
  recipe: Recipe; // the exact spec the bartender is graded against
  source: "gemini" | "classic";
};

// Safety and realism limits. Everything Gemini returns passes through parseOrder,
// so these hold even if the model ignores its instructions.
export const MIN_AGE = 21;
export const MAX_AGE = 99;
export const MAX_LIQUOR_OZ = 3; // spirits + liqueurs in one drink
export const MAX_INGREDIENTS = 6;
const MAX_TEXT = 200;
const SERVED_UP: GlassId[] = ["coupe", "martini", "shot"]; // glasses that never hold ice
const ICE_ROOM = 0.8; // share of a glass left for liquid once ice is in

// Catches an underage customer written into the dialogue even when the age field says 21+.
const UNDERAGE_HINTS = [
  /\b(?:[1-9]|1\d|20)\s*(?:years?\s*old|yrs?\s*old|y\/?o)\b/i,
  /\bfake\s*id\b/i,
  /\bunder\s*age\b|\bunderage\b/i, // not "minor": too many innocent uses ("a minor tweak")
  /\b(?:high|middle|junior\s*high)\s*school(?:er)?\b/i,
  /\b(?:teen|teenager)\b/i,
];

export const TECHNIQUES: Technique[] = ["build", "shake", "stir"];

export type ParseResult = { ok: true; order: Order } | { ok: false; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const has = <T extends object>(obj: T, key: unknown): key is keyof T =>
  typeof key === "string" && Object.hasOwn(obj, key);

function text(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`${field} is missing`);
  if (v.length > MAX_TEXT) throw new Error(`${field} is too long`);
  return v.trim();
}

const quarterOz = (n: number) => Math.round(n * 4) / 4;

// Validates and normalizes a raw Gemini order. Rejects rather than repairs anything unsafe.
export function parseOrder(raw: unknown): ParseResult {
  try {
    if (!isObject(raw)) throw new Error("order is not an object");

    const age = raw.customerAge;
    if (typeof age !== "number" || !Number.isInteger(age)) throw new Error("customer age is not a whole number");
    if (age < MIN_AGE) throw new Error(`customer is under ${MIN_AGE}`);
    if (age > MAX_AGE) throw new Error("customer age is unrealistic");

    const customer = { name: text(raw.customerName, "customer name"), age, vibe: text(raw.customerVibe, "customer vibe") };
    const line = text(raw.line, "line");
    const spoken = `${customer.name} ${customer.vibe} ${line}`;
    if (UNDERAGE_HINTS.some((re) => re.test(spoken))) throw new Error("dialogue suggests an underage customer");

    if (!has(GLASSES, raw.glass)) throw new Error(`unknown glass "${String(raw.glass)}"`);
    const glass = raw.glass;
    if (!TECHNIQUES.includes(raw.technique as Technique)) throw new Error(`unknown technique "${String(raw.technique)}"`);
    const technique = raw.technique as Technique;
    if (typeof raw.ice !== "boolean") throw new Error("ice is not true/false");
    if (raw.ice && SERVED_UP.includes(glass)) throw new Error(`a ${glass} glass is served without ice`);
    let garnish: GarnishId | null = null;
    if (raw.garnish !== "none") {
      if (!has(GARNISHES, raw.garnish)) throw new Error(`unknown garnish "${String(raw.garnish)}"`);
      garnish = raw.garnish;
    }

    if (!Array.isArray(raw.ingredients)) throw new Error("ingredients is not a list");
    if (raw.ingredients.length < 1 || raw.ingredients.length > MAX_INGREDIENTS) {
      throw new Error(`recipe needs 1-${MAX_INGREDIENTS} ingredients`);
    }
    const ingredients: Recipe["ingredients"] = [];
    for (const item of raw.ingredients) {
      if (!isObject(item) || !has(INGREDIENTS, item.ingredient)) throw new Error("recipe has an unknown ingredient");
      const id: IngredientId = item.ingredient;
      if (ingredients.some((i) => i.id === id)) throw new Error(`${id} is listed twice`);
      if (typeof item.oz !== "number" || !Number.isFinite(item.oz)) throw new Error(`${id} has no amount`);
      const oz = quarterOz(item.oz);
      if (oz < 0.25 || oz > 6) throw new Error(`${id} amount ${item.oz} oz is out of range`);
      ingredients.push({ id, oz });
    }

    const liquorOz = ingredients
      .filter((i) => ["spirit", "liqueur"].includes(INGREDIENTS[i.id].category))
      .reduce((sum, i) => sum + i.oz, 0);
    if (liquorOz > MAX_LIQUOR_OZ) throw new Error(`${liquorOz} oz of liquor is over the ${MAX_LIQUOR_OZ} oz limit`);

    const totalMl = ingredients.reduce((sum, i) => sum + i.oz, 0) * ML_PER_OZ;
    if (totalMl > GLASSES[glass].capacityMl * (raw.ice ? ICE_ROOM : 1)) throw new Error(`drink doesn't fit a ${glass} glass`);

    const recipe: Recipe = { name: text(raw.drinkName, "drink name"), glass, ingredients, technique, ice: raw.ice, garnish };
    return { ok: true, order: { customer, line, recipe, source: "gemini" } };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

const REGULARS: Customer[] = [
  { name: "Dana", age: 34, vibe: "regular, knows the menu" },
  { name: "Marcus", age: 27, vibe: "in a hurry between meetings" },
  { name: "Priya", age: 41, vibe: "celebrating a promotion" },
  { name: "Leo", age: 23, vibe: "first time at a cocktail bar" },
];

// Used when Gemini is down or its order fails validation, so the game never stalls.
export function classicOrder(recent: string[] = [], pick = Math.random): Order {
  const fresh = CLASSIC_RECIPES.filter((r) => !recent.includes(r.name));
  const pool = fresh.length ? fresh : CLASSIC_RECIPES;
  const recipe = pool[Math.floor(pick() * pool.length)];
  const customer = REGULARS[Math.floor(pick() * REGULARS.length)];
  return { customer, line: `Could I get a ${recipe.name}, please?`, recipe, source: "classic" };
}
