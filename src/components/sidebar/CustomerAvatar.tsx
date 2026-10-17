const SKIN = ["#f3cfb1", "#e0ac84", "#c68b5f", "#9a6440", "#6b4128"];
const HAIR = ["#2b1d14", "#5a3a22", "#a0522d", "#d8b26e", "#161616", "#8b8b8b", "#7a2e2e"];
const SHIRT = ["#3b82f6", "#ef4444", "#10b981", "#a855f7", "#f59e0b", "#14b8a6", "#e11d48"];
const INK = "#1f1611";

// FNV-1a, so the same name always draws the same face.
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export default function CustomerAvatar({ name }: { name: string }) {
  const h = hash(name);
  const skin = SKIN[h % SKIN.length];
  const hair = HAIR[(h >>> 4) % HAIR.length];
  const shirt = SHIRT[(h >>> 8) % SHIRT.length];
  const style = (h >>> 12) % 3; // 0 short, 1 bun, 2 long

  return (
    <svg viewBox="0 0 100 110" className="h-full w-full" aria-hidden>
      {style === 2 && <path d="M23 44 Q20 82 31 88 L69 88 Q80 82 77 44 Z" fill={hair} />}
      <path d="M10 110 Q13 80 50 78 Q87 80 90 110 Z" fill={shirt} />
      <rect x="43" y="62" width="14" height="18" rx="4" fill={skin} />
      <circle cx="50" cy="44" r="24" fill={skin} />
      {style === 1 && <circle cx="50" cy="15" r="9" fill={hair} />}
      <path
        d={
          style === 2
            ? "M26 48 Q23 18 50 18 Q77 18 74 48 Q70 30 50 28 Q30 30 26 48 Z"
            : "M26 42 Q26 18 50 18 Q74 18 74 42 Q64 29 50 29 Q36 29 26 42 Z"
        }
        fill={hair}
      />
      <circle cx="41" cy="46" r="2.4" fill={INK} />
      <circle cx="59" cy="46" r="2.4" fill={INK} />
      <path d="M42 56 Q50 62 58 56" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
