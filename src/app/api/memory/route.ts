import { backboardEnabled, createTraineeMemory } from "@/server/backboard";
import { allow, visitorOf } from "@/server/rateLimit";

const PER_VISITOR_PER_HOUR = 5;
const HOUR = 3_600_000;

// POST /api/memory -> { assistantId } | 503
// Creates this player's Backboard memory. The browser keeps the id and sends
// it with orders and grades; it carries no secret, only an address.
export async function POST(request: Request) {
  if (!backboardEnabled()) return Response.json({ error: "memory is not configured" }, { status: 503 });
  if (!allow(`memory:${visitorOf(request)}`, PER_VISITOR_PER_HOUR, HOUR)) {
    return Response.json({ error: "too many new memories" }, { status: 429 });
  }
  try {
    return Response.json({ assistantId: await createTraineeMemory() });
  } catch (err) {
    console.warn(`[memory] could not create: ${(err as Error).message}`);
    return Response.json({ error: "memory unavailable" }, { status: 502 });
  }
}
