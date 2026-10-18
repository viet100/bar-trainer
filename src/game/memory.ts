import type { Score } from "./score.ts";

// What the bartender's long-term memory (Backboard) holds, and how it's read
// back. Facts are written only by the server, from the deterministic score,
// so nothing a browser sends ends up in memory or, later, in a Gemini prompt.

export const MAX_FACTS_PER_DRINK = 3;
export const MAX_RECALLED = 6;
const MAX_FACT_LENGTH = 180;

export type MemoryFact = { content: string; metadata: { drink: string; stars: number; kind: "mistake" | "clean" } };

// One fact per costly mistake (costliest first), or a single "clean" fact for a
// drink with none, so the memory also knows what the trainee does well. Stars
// stay in metadata only: facts are saved while Gemini is still grading, so the
// rubric's stars can differ from the customer's final rating.
export function factsFromDrink(drink: string, score: Score): MemoryFact[] {
  const meta = { drink, stars: score.stars };
  if (score.mistakes.length === 0) {
    return [{ content: `${drink}: made to spec`, metadata: { ...meta, kind: "clean" } }];
  }
  return score.mistakes.slice(0, MAX_FACTS_PER_DRINK).map((m) => ({
    content: `${drink}: ${m}`.slice(0, MAX_FACT_LENGTH),
    metadata: { ...meta, kind: "mistake" },
  }));
}

// The search that pulls weak spots back out of memory.
export const WEAKNESS_QUERY = "bartending mistakes: over-pours, under-pours, wrong glass, technique, forgot to strain, garnish";

// Recalled memory is stored outside our app, so treat it as untrusted text:
// one line each, printable characters only, short, and only mistake facts.
export function recallBrief(contents: unknown[]): string[] {
  return contents
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.replace(/[^\p{L}\p{N}\p{P}\p{Zs}★]/gu, " ").replace(/\s+/g, " ").trim().slice(0, MAX_FACT_LENGTH))
    .filter((c) => c.length > 0 && !c.endsWith("made to spec"))
    .slice(0, MAX_RECALLED);
}

// Backboard assistant ids are UUIDs; anything else never reaches the API.
export const isAssistantId = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
