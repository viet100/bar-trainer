export type AiStatus = { gemini: boolean; memory: boolean };

// Tells players which AI features this deployment runs. Each one is on when
// its API key is set on the server; without them the game plays the same, off
// the classic menu and the built-in rubric.
export default function AiNotice({ gemini, memory }: AiStatus) {
  const message =
    gemini && memory
      ? "AI is on: Gemini writes the customers and their reactions, and Backboard remembers what you need to practice."
      : gemini
        ? "Gemini is on for customers and reactions. Practice memory is off, so orders aren't picked from your weak spots."
        : memory
          ? "Gemini is off: customers order from the classic menu and the built-in rubric grades your drinks. Backboard still remembers your mistakes."
          : "AI is off for now: customers order from the classic menu and the built-in rubric grades your drinks. Everything else plays the same.";
  return (
    <p
      role="status"
      className={`rounded-xl border p-2.5 text-xs ${gemini ? "border-sky-800/60 bg-sky-950/40 text-sky-200" : "border-stone-700 bg-stone-950/60 text-stone-300"}`}
    >
      {message}
    </p>
  );
}
