"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FLOW_RATE_ML_PER_S } from "@/lib/pour";

// Turns a held bottle into a stream of timed pour deltas. Where the liquid
// lands (and whether it fits) is the caller's business.
export function usePourController<Id extends string>(
  onPour: (id: Id, ml: number) => void,
  flowRateMlPerS = FLOW_RATE_ML_PER_S,
) {
  const [activeId, setActiveId] = useState<Id | null>(null);
  // volume of the current (or most recent) pour
  const [currentPourMl, setCurrentPourMl] = useState(0);

  const onPourRef = useRef(onPour);
  useEffect(() => {
    onPourRef.current = onPour;
  });

  // The rAF loop reads these refs so it never sees stale React state.
  const active = useRef<Id | null>(null);
  const poured = useRef(0);
  const lastTs = useRef(0);
  const raf = useRef<number | null>(null);

  // Volume is elapsed wall-clock time x flow rate, so dropped frames
  // don't change how much gets poured.
  const advance = useCallback(
    (now: number) => {
      const dt = now - lastTs.current;
      if (!active.current || dt <= 0) return;
      lastTs.current = now;
      const ml = (dt / 1000) * flowRateMlPerS;
      poured.current += ml;
      onPourRef.current(active.current, ml);
    },
    [flowRateMlPerS],
  );

  const stopPour = useCallback(() => {
    if (!active.current) return;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    advance(performance.now()); // count the partial frame since the last tick
    active.current = null;
    setActiveId(null);
    setCurrentPourMl(poured.current);
  }, [advance]);

  const startPour = useCallback(
    (id: Id) => {
      stopPour();
      active.current = id;
      poured.current = 0;
      lastTs.current = performance.now();
      setActiveId(id);
      setCurrentPourMl(0);

      const loop = (now: number) => {
        advance(now);
        setCurrentPourMl(poured.current);
        raf.current = requestAnimationFrame(loop);
      };
      raf.current = requestAnimationFrame(loop);
    },
    [advance, stopPour],
  );

  // A missed pointerup (alt-tab, tab hidden) must not leave the bottle pouring.
  useEffect(() => {
    window.addEventListener("blur", stopPour);
    document.addEventListener("visibilitychange", stopPour);
    return () => {
      window.removeEventListener("blur", stopPour);
      document.removeEventListener("visibilitychange", stopPour);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [stopPour]);

  return { activeId, currentPourMl, startPour, stopPour };
}
