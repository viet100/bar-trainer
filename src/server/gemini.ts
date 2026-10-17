// Minimal Gemini REST client: one structured-output call, no SDK. Server only,
// since it reads GEMINI_API_KEY.

// Tried in order. Free-tier quota is per model (20 requests/day each at the
// time of writing), so falling through on 429 multiplies the daily budget.
const MODELS = (process.env.GEMINI_MODELS ?? "gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const TIMEOUT_MS = 10_000;

// Strictest blocking on every category Gemini filters.
const SAFETY_SETTINGS = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({ category, threshold: "BLOCK_LOW_AND_ABOVE" }));

type GenerateJsonArgs = { system: string; prompt: string; schema: object };

// Out of quota, overloaded or too slow: worth trying the next model.
class ModelUnavailable extends Error {}

export async function generateJson(args: GenerateJsonArgs): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  let lastError: Error = new Error("no Gemini models configured");
  for (const model of MODELS) {
    try {
      return await callModel(model, key, args);
    } catch (err) {
      if (!(err instanceof ModelUnavailable)) throw err;
      console.warn(`[gemini] ${model} unavailable: ${err.message}`);
      lastError = err;
    }
  }
  throw lastError;
}

async function callModel(model: string, key: string, { system, prompt, schema }: GenerateJsonArgs) {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        safetySettings: SAFETY_SETTINGS,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          // "low" cut order latency from ~6.7 s to ~1.9 s in testing.
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
    });
  } catch (err) {
    if ((err as Error).name === "TimeoutError") throw new ModelUnavailable(`timed out after ${TIMEOUT_MS} ms`);
    throw err;
  }

  const json = await res.json();
  if (!res.ok) {
    const message = `Gemini ${res.status}: ${json.error?.status ?? json.error?.message ?? "unknown error"}`;
    throw res.status === 429 || res.status >= 500 ? new ModelUnavailable(message) : new Error(message);
  }

  const candidate = json.candidates?.[0];
  const text: string | undefined = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) {
    const why = json.promptFeedback?.blockReason ?? candidate?.finishReason ?? "no candidates";
    throw new Error(`Gemini returned no content (${why})`);
  }
  return JSON.parse(text);
}
