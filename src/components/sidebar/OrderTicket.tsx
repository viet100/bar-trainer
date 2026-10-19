import { GLASSES } from "@/game/glassware";
import { GARNISHES, INGREDIENTS } from "@/game/ingredients";
import type { Flavor } from "@/game/choice";
import type { Recipe } from "@/game/recipes";

type OrderTicketProps = {
  recipe: Recipe;
  special: string[]; // the customer's changes from the classic, shown even in memory mode
  choice?: Flavor; // bartender's choice: the flavor asked for
  ticketNo: number;
  hidden: boolean; // memory mode: name only, make it from memory
};

export default function OrderTicket({ recipe, special, choice, ticketNo, hidden }: OrderTicketProps) {
  return (
    <section className="-rotate-1 rounded-sm bg-[#f6efdf] px-4 py-3 font-mono text-stone-900 shadow-lg shadow-black/40">
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-stone-500">
        <span>Order</span>
        <span>#{String(ticketNo).padStart(3, "0")}</span>
      </div>
      {/* Bartender's choice: the drink stays a secret until it's served */}
      <p className="mt-1 text-lg font-bold leading-tight">{choice && hidden ? "Bartender’s choice" : recipe.name}</p>
      {choice && (
        <div className="mt-2 rounded-sm bg-amber-200 px-2 py-1.5 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-900">Asked for</p>
          <p className="mt-0.5 font-semibold">Something {choice}. Pick a classic that fits.</p>
        </div>
      )}
      {special.length > 0 && (
        <div className="mt-2 rounded-sm bg-amber-200 px-2 py-1.5 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-900">Special request</p>
          <ul className="mt-0.5 space-y-0.5 font-semibold">
            {special.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
      )}

      {hidden ? (
        <p className="mt-2 border-t border-dashed border-stone-400 pt-2 text-xs text-stone-600">
          {choice ? "Glass, spec and garnish are up to you." : "Memory mode: glass, spec and garnish are up to you."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-stone-600">
            {GLASSES[recipe.glass].name} · {recipe.technique} · {recipe.ice ? "on the rocks" : "up"} ·{" "}
            {recipe.garnish ? GARNISHES[recipe.garnish] : "no garnish"}
          </p>
          <ul className="mt-2 space-y-0.5 border-t border-dashed border-stone-400 pt-2 text-sm tabular-nums">
            {recipe.ingredients.map((i) => (
              <li key={i.id} className="flex justify-between gap-4">
                <span>{INGREDIENTS[i.id].name}</span>
                <span>{i.oz} oz</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
