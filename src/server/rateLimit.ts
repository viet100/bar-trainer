// In-memory sliding window. It lives in one server process, so it resets on
// restart and isn't shared between instances: enough to stop one script from
// draining the prepaid Gemini credit during a demo, not a general rate limiter.
const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

// The first x-forwarded-for entry is the client on Vercel-style proxies.
export const visitorOf = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  const ok = recent.length < limit;
  if (ok) recent.push(now);
  hits.set(key, recent);

  // Forget idle visitors so the map can't grow without bound.
  if (hits.size > MAX_KEYS) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return ok;
}
