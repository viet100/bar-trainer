import { isAssistantId, recallBrief, WEAKNESS_QUERY } from "@/game/memory";
import { classicOrder, parseOrder, parseOrderRequest } from "@/game/order";
import { backboardEnabled, recall } from "@/server/backboard";
import { generateJson } from "@/server/gemini";
import { buildOrderPrompt } from "@/server/orderPrompt";
import { allow, visitorOf } from "@/server/rateLimit";

const ATTEMPTS = 2;
// Real play needs about one order a minute (more with skips). Each order can
// cost up to 3 paid Gemini calls, so cap both one visitor and everyone together.
const PER_VISITOR_PER_MIN = 10;
const OVERALL_PER_MIN = 60;
const MINUTE = 60_000;

const RECALL_LIMIT = 8;

const REFUSAL =
  "Sorry, I can't help with that. This endpoint only writes the next bar customer's order from { recent, assistantId }; it doesn't take prompts or questions.";

// POST /api/order { recent?: string[], assistantId? } -> Order & { targeting?: string[] }
// Any other body is refused with a 400 and never reaches Gemini.
// Every Gemini order must pass parseOrder's safety checks. A rejected order is
// regenerated once; if Gemini is unreachable or keeps failing the checks, the
// customer orders off the classic menu so the game never stalls.
export async function POST(request: Request) {
  const body = parseOrderRequest(await request.json().catch(() => null));
  if (!body) return Response.json({ error: REFUSAL }, { status: 400 });
  const { recent } = body;

  // Over the limit, the customer still arrives, just off the free classic menu.
  const visitor = visitorOf(request);
  if (!allow(`ip:${visitor}`, PER_VISITOR_PER_MIN, MINUTE) || !allow("all", OVERALL_PER_MIN, MINUTE)) {
    console.warn(`[order] rate limited ${visitor}, serving a classic`);
    return Response.json(classicOrder(recent));
  }

  // The trainee's weak spots from Backboard memory steer the drink choice.
  const weakSpots = await recallWeakSpots(body.assistantId);

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let raw: unknown;
    try {
      raw = await generateJson(buildOrderPrompt(recent, weakSpots));
    } catch (err) {
      // Every model already failed; asking again would only burn quota.
      console.warn(`[order] Gemini unavailable, serving a classic: ${(err as Error).message}`);
      break;
    }
    const result = parseOrder(raw);
    if (result.ok) return Response.json(weakSpots.length ? { ...result.order, targeting: weakSpots.slice(0, 2) } : result.order);
    console.warn(`[order] attempt ${attempt}: rejected Gemini order: ${result.reason}`);
  }
  return Response.json(classicOrder(recent));
}

// Best effort: no memory, or a memory outage, just means an untargeted order.
async function recallWeakSpots(assistantId: unknown): Promise<string[]> {
  if (!isAssistantId(assistantId) || !backboardEnabled()) return [];
  try {
    return recallBrief(await recall(assistantId, WEAKNESS_QUERY, RECALL_LIMIT));
  } catch (err) {
    console.warn(`[memory] recall failed: ${(err as Error).message}`);
    return [];
  }
}
