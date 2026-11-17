import { getBusiness } from "@/lib/business";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addOptionEffect, removeOptionEffect } from "./actions";

const SELECT = "h-11 rounded-xl bg-tint px-2 font-semibold";

// "When a customer picks an option, use different / extra stock"
//   swap:  Oat milk  → use Oat milk INSTEAD OF Fresh milk (same amount as the recipe)
//   extra: Iced      → ALSO use 150 g Ice cubes
// create_order (migration 005) already reads these rows when an order is saved.
export async function OptionEffects() {
  const business = await getBusiness();
  if (!business) return null;

  const [{ data: options }, { data: stock }, { data: effects }] = await Promise.all([
    // options are public (anon key is fine); option_groups(name) = also bring the group's name
    supabase.from("options").select("id, name, option_groups(name)").eq("business_id", business.id),
    supabaseAdmin.from("stock_items").select("id, name, unit").eq("business_id", business.id).order("name"),
    supabaseAdmin
      .from("option_stock_effects")
      .select("id, option_id, stock_item_id, replaces_stock_item_id, qty")
      .eq("business_id", business.id),
  ]);
  const optionList = options ?? [];
  const stockList = stock ?? [];

  // "Oat milk (Milk)" — the group name helps when two groups have an option with the same name
  const optionLabel = (id: string) => {
    const o = optionList.find((x) => x.id === id);
    // option_groups comes back as one object here, but Supabase's types say "maybe a list" — handle both
    const group = Array.isArray(o?.option_groups) ? o?.option_groups[0] : o?.option_groups;
    return o ? `${o.name} (${group?.name ?? "?"})` : "?";
  };
  const stockOf = (id: string | null) => stockList.find((s) => s.id === id);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold">Options that change stock</h2>
      <p className="text-sm text-ink-2">e.g. Oat milk uses oat milk instead of fresh milk · Iced also uses 150 g ice</p>

      {/* the rules that exist, each with its own × form */}
      <div className="mt-3 flex flex-col gap-2">
        {(effects ?? []).length === 0 && <p className="text-sm text-ink-2">No rules yet.</p>}
        {(effects ?? []).map((e) => {
          const use = stockOf(e.stock_item_id);
          const instead = stockOf(e.replaces_stock_item_id);
          return (
            <form key={e.id} action={removeOptionEffect} className="flex items-center gap-2 rounded-xl bg-tint px-3 py-2">
              <input type="hidden" name="id" value={e.id} />
              <span className="font-semibold">{optionLabel(e.option_id)}</span>
              <span className="text-ink-2">→</span>
              <span>
                {instead
                  ? `use ${use?.name} instead of ${instead.name}`
                  : `also use ${Number(e.qty)} ${use?.unit} ${use?.name}`}
              </span>
              <button aria-label="Remove rule" className="ml-auto px-1 text-lg font-bold text-red-700">
                ×
              </button>
            </form>
          );
        })}
      </div>

      {/* add a rule: "Instead of" empty = an EXTRA (then the amount is needed) */}
      {optionList.length > 0 && stockList.length > 0 && (
        <form action={addOptionEffect} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-sm font-semibold text-ink-2">
            When the customer picks
            <select name="option_id" className={`${SELECT} mt-1`}>
              {optionList.map((o) => (
                <option key={o.id} value={o.id}>
                  {optionLabel(o.id)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-semibold text-ink-2">
            use
            <select name="stock_item_id" className={`${SELECT} mt-1`}>
              {stockList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.unit})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-semibold text-ink-2">
            instead of
            <select name="replaces_stock_item_id" defaultValue="" className={`${SELECT} mt-1`}>
              <option value="">— nothing (extra) —</option>
              {stockList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-28 flex-col text-sm font-semibold text-ink-2">
            amount (extra)
            <input name="qty" inputMode="decimal" placeholder="e.g. 150" className={`${SELECT} mt-1 px-3`} />
          </label>
          <button className="h-11 rounded-xl bg-primary px-4 font-bold text-white">Add rule</button>
        </form>
      )}
    </section>
  );
}