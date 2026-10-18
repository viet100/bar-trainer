// Minimal Backboard client for the trainee's long-term memory: plain fetch,
// no SDK. Server only, since it reads BACKBOARD_API_KEY. Each player gets one
// Backboard assistant, which owns their memories across sessions.

const BASE = "https://app.backboard.io/api";
const TIMEOUT_MS = 8_000;

export const backboardEnabled = () => !!process.env.BACKBOARD_API_KEY;

async function call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  const key = process.env.BACKBOARD_API_KEY;
  if (!key) throw new Error("BACKBOARD_API_KEY is not set");
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Backboard ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json as T;
}

export async function createTraineeMemory(): Promise<string> {
  const { assistant_id } = await call<{ assistant_id: string }>("/assistants", {
    method: "POST",
    body: {
      name: "Make a Drink trainee",
      system_prompt: "Long-term memory of one bartending trainee's practice: the mistakes they make and the drinks they make well.",
    },
  });
  return assistant_id;
}

export async function remember(assistantId: string, content: string, metadata: Record<string, unknown>) {
  await call(`/assistants/${assistantId}/memories`, { method: "POST", body: { content, metadata } });
}

export async function recall(assistantId: string, query: string, limit: number): Promise<unknown[]> {
  const { memories } = await call<{ memories?: { content?: unknown }[] }>(`/assistants/${assistantId}/memories/search`, {
    method: "POST",
    body: { query, limit },
  });
  return (memories ?? []).map((m) => m.content);
}
