"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "make-a-drink:memory";

// This player's Backboard memory id: read from the browser if we've made one
// before, otherwise created once. Storage can be blocked (private windows), and
// memory can be switched off on the server; either way the game plays the
// same, just without targeted orders.
export function useTraineeMemory() {
  const [assistantId, setAssistantId] = useState<string | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (saved) {
      const id = saved;
      queueMicrotask(() => setAssistantId(id)); // after the effect, not during it
      return;
    }
    let cancelled = false;
    fetch("/api/memory", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { assistantId?: string } | null) => {
        if (cancelled || !data?.assistantId) return;
        try {
          localStorage.setItem(STORAGE_KEY, data.assistantId);
        } catch {}
        setAssistantId(data.assistantId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return assistantId;
}
