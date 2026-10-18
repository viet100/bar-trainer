import { fallbackGrade, parseGrade, parseMeasurement, type Grade } from "@/game/grade";
import { factsFromDrink, isAssistantId } from "@/game/memory";
import { recheckOrder, type Order } from "@/game/order";
import { scoreDrink, type Score } from "@/game/score";
import { backboardEnabled, remember } from "@/server/backboard";
import { generateJson } from "@/server/gemini";
import { buildGradePrompt } from "@/server/gradePrompt";
import { allow, visitorOf } from "@/server/rateLimit";

const ATTEMPTS = 2;
const PER_VISITOR_PER_MIN = 10;
const OVERALL_PER_MIN = 60;
const MINUTE = 60_000;

// POST /api/grade { order, measurement, assistantId? } -> { score, grade }
// The score is recomputed here from the re-checked order and measurement, so
// nothing the browser sends reaches Gemini or the player's memory unchecked.
// Gemini voices the customer and coach within one star of the rubric; if it's
// unavailable or its grade fails the checks, a canned rubric grade is used.
// With an assistantId, the drink's measured mistakes are saved to that
// player's Backboard memory while Gemini grades.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const checked = recheckOrder(body?.order);
  if (!checked.ok) return Response.json({ error: `bad order: ${checked.reason}` }, { status: 400 });
  const measurement = parseMeasurement(body?.measurement, checked.order.recipe);
  if (!measurement) return Response.json({ error: "bad measurement" }, { status: 400 });
  const score = scoreDrink(measurement);

  const visitor = visitorOf(request);
  if (!allow(`grade:${visitor}`, PER_VISITOR_PER_MIN, MINUTE) || !allow("grade:all", OVERALL_PER_MIN, MINUTE)) {
    console.warn(`[grade] rate limited ${visitor}, using the rubric grade`);
    return Response.json({ score, grade: fallbackGrade(score) });
  }

  const [grade] = await Promise.all([gradeWithGemini(checked.order, score), saveToMemory(body?.assistantId, checked.order, score)]);
  return Response.json({ score, grade });
}

async function gradeWithGemini(order: Order, score: Score): Promise<Grade> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let raw: unknown;
    try {
      raw = await generateJson(buildGradePrompt(order, score));
    } catch (err) {
      console.warn(`[grade] Gemini unavailable, using the rubric grade: ${(err as Error).message}`);
      break;
    }
    const result = parseGrade(raw, score);
    if (result.ok) return result.grade;
    console.warn(`[grade] attempt ${attempt}: rejected Gemini grade: ${result.reason}`);
  }
  return fallbackGrade(score);
}

// Best effort: a memory outage never blocks grading.
async function saveToMemory(assistantId: unknown, order: Order, score: Score) {
  if (!isAssistantId(assistantId) || !backboardEnabled()) return;
  const results = await Promise.allSettled(
    factsFromDrink(order.recipe.name, score).map((f) => remember(assistantId, f.content, f.metadata)),
  );
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) console.warn(`[memory] ${failed.length} fact(s) not saved: ${(failed[0] as PromiseRejectedResult).reason}`);
}
