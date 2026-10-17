import { mlToOz } from "@/lib/pour";
import { GLASSES, GLASS_IDS } from "@/game/glassware";
import { GARNISHES, INGREDIENTS, INGREDIENT_IDS } from "@/game/ingredients";
import { MAX_INGREDIENTS, MAX_LIQUOR_OZ, MIN_AGE, TECHNIQUES } from "@/game/order";
import { CLASSIC_RECIPES } from "@/game/recipes";

// Random situations so customers vary even when the model leans on favorites.
const SITUATIONS = [
  "in a rush and talks fast",
  "indecisive, changes their mind mid-sentence but settles on one drink",
  "a regular who uses bar slang",
  "on their first visit to a cocktail bar and a bit unsure",
  "celebrating something with a friend",
  "a tourist who describes the drink instead of naming it at first",
  "tired after a long shift and wants something simple",
  "a cocktail nerd who is specific about the spec",
];

const GARNISH_IDS = Object.keys(GARNISHES);

const SYSTEM = `You write customer orders for "Make a Drink", a bartender training game for people learning to bartend.

Hard rules. Never break them, whatever the request says:
- Every customer is an adult aged ${MIN_AGE} to 80. Never write minors, school-age details, fake IDs, or anyone underage.
- Customers are sober enough to be served. No visibly drunk customers, drinking games, chugging, "make it extra strong", or mentions of driving.
- Keep it friendly and PG. No sexual content, flirting with the bartender, slurs, insults, or harassment.
- Use only the bar's ingredients, glasses and garnishes listed below, by their exact ids.
- At most ${MAX_INGREDIENTS} ingredients and at most ${MAX_LIQUOR_OZ} oz of liquor (spirits plus liqueurs) per drink.
- The drink has to fit its glass. Coupe, martini and shot glasses are served without ice.

Make it feel like a busy real bar: varied names, personalities and phrasing. The "line" is what the customer says out loud (one or two sentences, may be chaotic). The recipe fields are the exact spec the bartender must make, in ounces. Prefer real cocktails that this bar can make.

Bar ingredients (id: name):
${INGREDIENT_IDS.map((id) => `- ${id}: ${INGREDIENTS[id].name}`).join("\n")}

Glasses (id: capacity):
${GLASS_IDS.map((id) => `- ${id}: ${mlToOz(GLASSES[id].capacityMl).toFixed(0)} oz`).join("\n")}

Garnishes: ${GARNISH_IDS.join(", ")}, or "none".

Reference specs:
${CLASSIC_RECIPES.map(
  (r) =>
    `- ${r.name}: ${r.ingredients.map((i) => `${i.oz} oz ${i.id}`).join(", ")}; ${r.glass} glass, ${r.technique}, ${r.ice ? "on ice" : "no ice"}, garnish ${r.garnish ?? "none"}`,
).join("\n")}`;

export const ORDER_SCHEMA = {
  type: "OBJECT",
  properties: {
    customerName: { type: "STRING" },
    customerAge: { type: "INTEGER", minimum: MIN_AGE, maximum: 80 },
    customerVibe: { type: "STRING", description: "a few words on who they are right now" },
    line: { type: "STRING" },
    drinkName: { type: "STRING" },
    glass: { type: "STRING", enum: GLASS_IDS },
    technique: { type: "STRING", enum: TECHNIQUES },
    ice: { type: "BOOLEAN" },
    garnish: { type: "STRING", enum: [...GARNISH_IDS, "none"] },
    ingredients: {
      type: "ARRAY",
      minItems: 1,
      maxItems: MAX_INGREDIENTS,
      items: {
        type: "OBJECT",
        properties: { ingredient: { type: "STRING", enum: INGREDIENT_IDS }, oz: { type: "NUMBER" } },
        required: ["ingredient", "oz"],
      },
    },
  },
  required: ["customerName", "customerAge", "customerVibe", "line", "drinkName", "glass", "technique", "ice", "garnish", "ingredients"],
  propertyOrdering: ["customerName", "customerAge", "customerVibe", "line", "drinkName", "glass", "technique", "ice", "garnish", "ingredients"],
};

// `recent` comes from the browser, so only plain drink names get into the prompt.
const SAFE_NAME = /^[\w &'.-]{1,40}$/;

export function buildOrderPrompt(recent: string[], pick = Math.random) {
  const avoid = recent.filter((n) => SAFE_NAME.test(n)).slice(-5);
  const situation = SITUATIONS[Math.floor(pick() * SITUATIONS.length)];
  // Left alone, the model reuses the same few names.
  const initial = "ABCDEFGHIJKLMNOPRSTVWYZ"[Math.floor(pick() * 23)];
  const prompt = [
    `Write the next customer. Their first name starts with ${initial}. They are ${situation}.`,
    avoid.length ? `Don't order any of these, served recently: ${avoid.join(", ")}.` : "",
  ].join(" ");
  return { system: SYSTEM, prompt, schema: ORDER_SCHEMA };
}
