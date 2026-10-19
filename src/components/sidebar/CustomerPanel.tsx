import CustomerAvatar from "@/components/sidebar/CustomerAvatar";
import type { Order } from "@/game/order";

type CustomerPanelProps = {
  order: Order;
  arrival: number; // bumps on every new customer to replay the walk-in
  loading: boolean;
  reaction?: string; // after serving, the customer's verdict replaces their order line
};

export default function CustomerPanel({ order, arrival, loading, reaction }: CustomerPanelProps) {
  const { customer } = order;

  return (
    <section aria-live="polite" className={`transition-opacity duration-300 ${loading ? "opacity-30" : ""}`}>
      <div className="flex items-end gap-3">
        <div key={`a${arrival}`} className="h-24 w-20 shrink-0 animate-walk-in">
          <CustomerAvatar name={customer.name} />
        </div>
        <p
          key={`b${arrival}${reaction ? "r" : ""}`}
          className="mb-6 animate-bubble-in rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2 text-sm leading-snug text-stone-900 shadow-lg shadow-black/30"
        >
          {reaction ?? order.line}
        </p>
      </div>
      {/* No age on screen: every order is checked to be 21+ on the server. */}
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold text-stone-100">{customer.name}</span>
        {order.source === "classic" && <span className="text-[11px] text-stone-500">classic menu</span>}
      </p>
      <p className="text-xs text-stone-500">{customer.vibe}</p>
    </section>
  );
}
