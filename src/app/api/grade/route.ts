import { fallbackGrade, parseGrade, parseMeasurement } from "@/game/grade";
import { recheckOrder } from "@/game/order";
import { scoreDrink } from "@/game/score";
import { generateJson } from "@/server/gemini";
import { buildGradePrompt } from "@/server/gradePrompt";
import { allow, visitorOf } from "@/server/rateLimit";

const ATTEMPTS = 2;
const PER_VISITOR_PER_MIN = 10;
const OVERALL_PER_MIN = 60;
const MINUTE = 60_000;

// POST /api/grade { order, measurement } -> { score, grade }
// The score is recomputed here from the re-checked order and measurement, so
// nothing the browser sends reaches Gemini unchecked. Gemini voices the
// customer and coach within one star of the rubric; if it's unavailable or its
// grade fails the checks, a canned grade built from the rubric is returned.
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

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let raw: unknown;
    try {
      raw = await generateJson(buildGradePrompt(checked.order, score));
    } catch (err) {
      console.warn(`[grade] Gemini unavailable, using the rubric grade: ${(err as Error).message}`);
      break;
    }
    const result = parseGrade(raw, score);
    if (result.ok) return Response.json({ score, grade: result.grade });
    console.warn(`[grade] attempt ${attempt}: rejected Gemini grade: ${result.reason}`);
  }
  return Response.json({ score, grade: fallbackGrade(score) });
}
