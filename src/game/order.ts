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
  special: string[]; // how this differs from the classic of the same name: the customer's special request
  targeting?: string[]; // weak spots from the trainee's memory that this order was picked to practise
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
const UNDER_21 = String.raw`(?:[1-9]|1\d|20|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)`;
const UNDERAGE_HINTS = [
  new RegExp(String.raw`\b${UNDER_21}\s*(?:years?\s*old|yrs?\s*old|y\/?o)\b`, "i"),
  // "I'm 19", "just turned nineteen" (but not "twenty-one", which is 21+)
  new RegExp(String.raw`\b(?:i'?m|i\s+am|just\s+turned|turning)\s+${UNDER_21}\b(?!-)`, "i"),
  /\b(?:1\d|20)(?:st|nd|rd|th)\s+birthday\b/i,
  /\b(?:sweet\s+sixteen|quincea[ñn]era)\b/i,
  /\bfake\s*id\b/i,
  /\bunder\s*age\b|\bunderage\b/i, // not "minor": too many innocent uses ("a minor tweak")
  /\b(?:high|middle|junior\s*high)\s*school(?:er)?\b/i,
  /\b(?:teen|teenager)\b/i,
];

// Catches dialogue that pushes over-serving, even when the recipe itself stays under the liquor cap.
const SPIRIT_WORDS = "shots?|pours?|tequila|vodka|gin|rum|booze|liquor|alcohol";
const OVERSERVING_HINTS = [
  new RegExp(`\\b(?:double|triple|quadruple)\\s+(?:${SPIRIT_WORDS}|it|that)\\b`, "i"),
  new RegExp(`\\bextra\\s+(?:strong|${SPIRIT_WORDS})\\b`, "i"),
  new RegExp(`\\bheavy\\s+(?:on\\s+the\\s+)?(?:${SPIRIT_WORDS})\\b`, "i"),
  /\bmake\s+it\s+(?:strong|stronger|a\s+double)\b/i,
  /\b(?:chug|chugging|wasted|hammered|blackout|plastered|get\s+drunk|shit-?faced)\b/i,
  /\bdriv(?:e|ing)\s+(?:home|after)\b/i,
];

// Shared by orders and graded reactions: anything a customer says goes through here.
export function dialogueProblem(spoken: string): string | null {
  if (UNDERAGE_HINTS.some((re) => re.test(spoken))) return "dialogue suggests an underage customer";
  if (OVERSERVING_HINTS.some((re) => re.test(spoken))) return "dialogue pushes over-serving";
  return null;
}

export const TECHNIQUES: Technique[] = ["build", "shake", "stir"];

export type ParseResult = { ok: true; order: Order } | { ok: false; reason: string };

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
export const has = <T extends object>(obj: T, key: unknown): key is keyof T =>
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
    const problem = dialogueProblem(`${customer.name} ${customer.vibe} ${line}`);
    if (problem) throw new Error(problem);

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
    return { ok: true, order: { customer, line, recipe, source: "gemini", special: specialChanges(recipe) } };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

const PAST: Record<Technique, string> = { build: "built", shake: "shaken", stir: "stirred" };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const garnishName = (g: GarnishId | null) => (g ? GARNISHES[g].toLowerCase() : "no garnish");

// What a customer changed from the classic of the same name, in words for the
// ticket ("Shaken, not stirred"). Worked out from the spec itself, so the
// ticket can't disagree with what's graded. A drink that isn't a classic has none.
export function specialChanges(recipe: Recipe): string[] {
  const classic = CLASSIC_RECIPES.find((r) => r.name.toLowerCase() === recipe.name.toLowerCase());
  if (!classic) return [];
  const changes: string[] = [];
  if (recipe.technique !== classic.technique) changes.push(`${cap(PAST[recipe.technique])}, not ${PAST[classic.technique]}`);
  if (recipe.ice !== classic.ice) changes.push(recipe.ice ? "On the rocks, not up" : "Up, not on the rocks");
  if (recipe.glass !== classic.glass) changes.push(`${GLASSES[recipe.glass].name} glass, not ${GLASSES[classic.glass].name.toLowerCase()}`);
  if (recipe.garnish !== classic.garnish) changes.push(`${cap(garnishName(recipe.garnish))}, not ${garnishName(classic.garnish)}`);
  const before = new Map(classic.ingredients.map((i) => [i.id, i.oz]));
  for (const i of recipe.ingredients) {
    const was = before.get(i.id);
    if (was === undefined) changes.push(`Add ${i.oz} oz ${INGREDIENTS[i.id].name}`);
    else if (was !== i.oz) changes.push(`${INGREDIENTS[i.id].name}: ${i.oz} oz, not ${was}`);
  }
  for (const i of classic.ingredients) {
    if (!recipe.ingredients.some((r) => r.id === i.id)) changes.push(`No ${INGREDIENTS[i.id].name}`);
  }
  return changes;
}

// An order that went to the browser and came back is untrusted again; this
// re-runs it through the same checks as a fresh Gemini order.
export function recheckOrder(order: unknown): ParseResult {
  if (!isObject(order) || !isObject(order.customer) || !isObject(order.recipe)) {
    return { ok: false, reason: "order is malformed" };
  }
  const { customer, recipe } = order;
  const result = parseOrder({
    customerName: customer.name,
    customerAge: customer.age,
    customerVibe: customer.vibe,
    line: order.line,
    drinkName: recipe.name,
    glass: recipe.glass,
    technique: recipe.technique,
    ice: recipe.ice,
    garnish: recipe.garnish ?? "none",
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map((i) => (isObject(i) ? { ingredient: i.id, oz: i.oz } : i))
      : recipe.ingredients,
  });
  return result.ok && order.source === "classic" ? { ok: true, order: { ...result.order, source: "classic" } } : result;
}

const REGULARS: Customer[] = [
  { name: "Dana", age: 34, vibe: "regular, knows the menu" },
  { name: "Marcus", age: 27, vibe: "in a hurry between meetings" },
  { name: "Priya", age: 41, vibe: "celebrating a promotion" },
  { name: "Leo", age: 23, vibe: "first time at a cocktail bar" },
];

// Used when Gemini is down or its order fails validation, so the game never stalls.
// The only input /api/order takes: recently served drink names and the
// player's memory id. Anything else (a chat prompt, extra fields, non-string
// names) is refused before it can reach Gemini.
const ORDER_REQUEST_KEYS = new Set(["recent", "assistantId"]);
const MAX_RECENT = 10;
export type OrderRequest = { recent: string[]; assistantId: unknown };

export function parseOrderRequest(body: unknown): OrderRequest | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).some((k) => !ORDER_REQUEST_KEYS.has(k))) return null;
  const recent = fields.recent ?? [];
  if (!Array.isArray(recent) || recent.length > MAX_RECENT || !recent.every((n) => typeof n === "string")) return null;
  return { recent, assistantId: fields.assistantId };
}

// About this share of customers asks for a twist on a classic.
export const SPECIAL_RATE = 0.3;

// Twists the classic menu can make on its own, each changing one thing and
// saying it the way a customer would. null: this twist doesn't suit the drink.
type Twist = (r: Recipe) => { recipe: Recipe; ask: string } | null;
const SWAP_GARNISH: Partial<Record<GarnishId, GarnishId>> = {
  "lime-wedge": "lemon-wheel",
  "lemon-twist": "orange-peel",
  "lemon-wheel": "lime-wedge",
  olive: "lemon-twist",
  "orange-peel": "lemon-twist",
  "orange-wheel": "cherry",
  cherry: "orange-peel",
  mint: "lime-wedge",
};
const TWISTS: Twist[] = [
  (r) => {
    const g = r.garnish && SWAP_GARNISH[r.garnish];
    return g ? { recipe: { ...r, garnish: g }, ask: `with a ${garnishName(g)} instead of the ${garnishName(r.garnish)}` } : null;
  },
  (r) =>
    r.technique === "build"
      ? null
      : r.technique === "shake"
        ? { recipe: { ...r, technique: "stir" }, ask: "stirred, not shaken" }
        : { recipe: { ...r, technique: "shake" }, ask: "shaken, not stirred" },
  (r) =>
    !r.ice && r.glass !== "shot"
      ? { recipe: { ...r, ice: true, glass: "rocks" }, ask: "on the rocks" }
      : r.ice && r.glass === "rocks"
        ? { recipe: { ...r, ice: false, glass: "coupe" }, ask: "up, in a coupe" }
        : null,
];

export function classicOrder(recent: string[] = [], pick = Math.random): Order {
  const fresh = CLASSIC_RECIPES.filter((r) => !recent.includes(r.name));
  const pool = fresh.length ? fresh : CLASSIC_RECIPES;
  const recipe = pool[Math.floor(pick() * pool.length)];
  const customer = REGULARS[Math.floor(pick() * REGULARS.length)];
  const standard: Order = { customer, line: `Could I get a ${recipe.name}, please?`, recipe, source: "classic", special: [] };
  if (pick() < 1 - SPECIAL_RATE) return standard;
  const twists = TWISTS.map((t) => t(recipe)).filter((t) => t !== null);
  const twist = twists[Math.floor(pick() * twists.length)];
  if (!twist) return standard;
  // The twisted spec goes through the same checks as any order (it must still fit its glass).
  const checked = recheckOrder({ ...standard, recipe: twist.recipe, line: `Could I get a ${recipe.name}, ${twist.ask}, please?` });
  return checked.ok ? checked.order : standard;
}
