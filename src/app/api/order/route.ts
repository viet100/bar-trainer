import { classicOrder, parseOrder } from "@/game/order";
import { generateJson } from "@/server/gemini";
import { buildOrderPrompt } from "@/server/orderPrompt";
import { allow } from "@/server/rateLimit";

const ATTEMPTS = 2;
// Real play needs about one order a minute (more with skips). Each order can
// cost up to 3 paid Gemini calls, so cap both one visitor and everyone together.
const PER_VISITOR_PER_MIN = 10;
const OVERALL_PER_MIN = 60;
const MINUTE = 60_000;

// POST /api/order { recent?: string[] } -> Order
// Every Gemini order must pass parseOrder's safety checks. A rejected order is
// regenerated once; if Gemini is unreachable or keeps failing the checks, the
// customer orders off the classic menu so the game never stalls.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const recent: string[] = Array.isArray(body?.recent)
    ? body.recent.filter((n: unknown): n is string => typeof n === "string")
    : [];

  // Over the limit, the customer still arrives, just off the free classic menu.
  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!allow(`ip:${visitor}`, PER_VISITOR_PER_MIN, MINUTE) || !allow("all", OVERALL_PER_MIN, MINUTE)) {
    console.warn(`[order] rate limited ${visitor}, serving a classic`);
    return Response.json(classicOrder(recent));
  }

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let raw: unknown;
    try {
      raw = await generateJson(buildOrderPrompt(recent));
    } catch (err) {
      // Every model already failed; asking again would only burn quota.
      console.warn(`[order] Gemini unavailable, serving a classic: ${(err as Error).message}`);
      break;
    }
    const result = parseOrder(raw);
    if (result.ok) return Response.json(result.order);
    console.warn(`[order] attempt ${attempt}: rejected Gemini order: ${result.reason}`);
  }
  return Response.json(classicOrder(recent));
}
