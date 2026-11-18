import { Package, Plus, X } from "lucide-react";

import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { removeRecipeLine, saveRecipeLine } from "./actions";

// A SERVER component that loads its own data: the shop's stock + this item's recipe.
// (Recipes and stock are private, so they're read with the secret key, here on the server.)
export async function RecipeEditor({ menuItemId }: { menuItemId: number }) {
    const business = await getBusiness();
    if (!business) return null;

    // Promise.all = ask Supabase both questions at the same time (faster than one after the other)
    const [{ data: stock }, { data: recipe }] = await Promise.all([
        supabaseAdmin.from("stock_items").select("id, name, unit").eq("business_id", business.id).order("name"),
        supabaseAdmin
            .from("menu_item_recipes")
            .select("stock_item_id, qty")
            .eq("business_id", business.id)
            .eq("menu_item_id", menuItemId),
    ]);
    const stockList = stock ?? [];
    const lines = recipe ?? [];
    const stockOf = (id: string) => stockList.find((s) => s.id === id);
    const notUsedYet = stockList.filter((s) => !lines.some((l) => l.stock_item_id === s.id));

    return (
        <div className="border-t border-line p-5">
            <p className="flex items-center gap-2 font-bold">
                <Package className="h-4 w-4 text-primary" />
                Stock used per item
            </p>
            <p className="text-sm text-ink-2">Taken out of stock automatically every time this item is sold.</p>

            {stockList.length === 0 && <p className="mt-2 text-sm text-ink-2">Add stock items on the Stock page first.</p>}
            {stockList.length > 0 && lines.length === 0 && (
                <p className="mt-2 rounded-xl border border-dashed border-line p-3 text-sm text-ink-3">Not tracked — this item never runs out.</p>
            )}

            {/* each line is its own tiny form, so its × button knows which line to remove */}
            {lines.map((l) => {
                const s = stockOf(l.stock_item_id);
                return (
                    <form key={l.stock_item_id} action={removeRecipeLine} className="mt-2 flex items-center gap-2 rounded-xl bg-tint px-3 py-2">
                        <input type="hidden" name="menu_item_id" value={menuItemId} />
                        <input type="hidden" name="stock_item_id" value={l.stock_item_id} />
                        <span className="font-semibold">{s?.name ?? "?"}</span>
                        <span className="money ml-auto font-semibold">
                            {Number(l.qty)} <span className="text-sm text-ink-2">{s?.unit}</span>
                        </span>
                        <button aria-label={`Remove ${s?.name}`} className="press rounded-lg p-1.5 text-ink-3 hover:bg-danger/10 hover:text-danger">
                            <X className="h-4 w-4" />
                        </button>
                    </form>
                );
            })}

            {/* add a line: pick a stock item that isn't in the recipe yet + how much */}
            {notUsedYet.length > 0 && (
                <form action={saveRecipeLine} className="mt-3 flex gap-2">
                    <input type="hidden" name="menu_item_id" value={menuItemId} />
                    <select name="stock_item_id" aria-label="Stock item" className="h-11 min-w-0 flex-1 rounded-xl bg-tint px-3 font-semibold outline-none focus:ring-2 focus:ring-primary-soft">
                        {notUsedYet.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name} ({s.unit})
                            </option>
                        ))}
                    </select>
                    <input name="qty" inputMode="decimal" placeholder="qty" required aria-label="Amount used" className="money h-11 w-20 rounded-xl bg-tint px-3 text-right font-semibold outline-none focus:ring-2 focus:ring-primary-soft" />
                    <button className="btn-soft flex h-11 items-center gap-1 px-3 text-sm">
                        <Plus className="h-4 w-4" />
                        Add
                    </button>
                </form>
            )}
        </div>
    );
}