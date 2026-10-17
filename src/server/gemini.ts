// Minimal Gemini REST client: one structured-output call, no SDK. Server only,
// since it reads GEMINI_API_KEY.

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
const TIMEOUT_MS = 12_000;

// Strictest blocking on every category Gemini filters.
const SAFETY_SETTINGS = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({ category, threshold: "BLOCK_LOW_AND_ABOVE" }));

type GenerateJsonArgs = { system: string; prompt: string; schema: object };

export async function generateJson({ system, prompt, schema }: GenerateJsonArgs): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
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

  const json = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${json.error?.message ?? "unknown error"}`);

  const candidate = json.candidates?.[0];
  const text: string | undefined = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) {
    const why = json.promptFeedback?.blockReason ?? candidate?.finishReason ?? "no candidates";
    throw new Error(`Gemini returned no content (${why})`);
  }
  return JSON.parse(text);
}
