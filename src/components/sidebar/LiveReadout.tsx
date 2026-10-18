type LiveReadoutProps = {
  pouringName: string | null;
  targetName: string;
  currentPourOz: number;
  glassOz: number;
  glassCapacityOz: number;
  shakerOz: number;
  shakeSeconds: number;
  stirSeconds: number;
  capped: boolean;
  spilledOz: number;
};

const f = (n: number) => n.toFixed(2);

export default function LiveReadout(p: LiveReadoutProps) {
  return (
    <section className="rounded-xl border border-stone-800 bg-stone-950/60 p-3 font-mono text-xs tabular-nums text-stone-400">
      <p className="font-sans text-[11px] uppercase tracking-widest text-stone-500">
        {p.pouringName ? `Pouring ${p.pouringName} → ${p.targetName}` : `Last pour · into ${p.targetName}`}
      </p>
      <p className={`text-3xl font-semibold ${p.pouringName ? "text-amber-200" : "text-stone-100"}`}>
        {f(p.currentPourOz)}
        <span className="ml-1 text-sm text-stone-500">oz</span>
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt>Glass</dt>
        <dd>{p.glassCapacityOz > 0 ? `${f(p.glassOz)} / ${f(p.glassCapacityOz)} oz` : "none picked"}</dd>
        <dt>Tin</dt>
        <dd>
          {f(p.shakerOz)} oz{p.capped && " · capped"} · {p.shakeSeconds.toFixed(1)}s shaken · {p.stirSeconds.toFixed(1)}s stirred
        </dd>
        {p.spilledOz > 0 && (
          <>
            <dt className="text-red-400">Spilled</dt>
            <dd className="text-red-400">{f(p.spilledOz)} oz</dd>
          </>
        )}
      </dl>
    </section>
  );
}
