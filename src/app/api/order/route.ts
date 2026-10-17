import { classicOrder, parseOrder } from "@/game/order";
import { generateJson } from "@/server/gemini";
import { buildOrderPrompt } from "@/server/orderPrompt";

const ATTEMPTS = 2;

// POST /api/order { recent?: string[] } -> Order
// Every Gemini order must pass parseOrder's safety checks. After ATTEMPTS
// failures the customer orders off the classic menu, so the game never stalls.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const recent: string[] = Array.isArray(body?.recent)
    ? body.recent.filter((n: unknown): n is string => typeof n === "string")
    : [];

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const result = parseOrder(await generateJson(buildOrderPrompt(recent)));
      if (result.ok) return Response.json(result.order);
      console.warn(`[order] attempt ${attempt}: rejected Gemini order: ${result.reason}`);
    } catch (err) {
      console.warn(`[order] attempt ${attempt}: Gemini call failed: ${(err as Error).message}`);
    }
  }
  return Response.json(classicOrder(recent));
}
