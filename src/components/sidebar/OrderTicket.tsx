import { GLASSES } from "@/game/glassware";
import { GARNISHES, INGREDIENTS } from "@/game/ingredients";
import type { Recipe } from "@/game/recipes";

type OrderTicketProps = {
  recipe: Recipe;
  ticketNo: number;
  hidden: boolean; // memory mode: name only, make it from memory
};

export default function OrderTicket({ recipe, ticketNo, hidden }: OrderTicketProps) {
  return (
    <section className="-rotate-1 rounded-sm bg-[#f6efdf] px-4 py-3 font-mono text-stone-900 shadow-lg shadow-black/40">
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-stone-500">
        <span>Order</span>
        <span>#{String(ticketNo).padStart(3, "0")}</span>
      </div>
      <p className="mt-1 text-lg font-bold leading-tight">{recipe.name}</p>

      {hidden ? (
        <p className="mt-2 border-t border-dashed border-stone-400 pt-2 text-xs text-stone-600">
          Memory mode: glass, spec and garnish are up to you.
        </p>
      ) : (
        <>
          <p className="text-xs text-stone-600">
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
