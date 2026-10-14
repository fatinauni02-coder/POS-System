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
            <p className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">Recipe · stock used for 1 sold</p>

            {stockList.length === 0 && <p className="mt-2 text-sm text-ink-2">Add stock items on the Stock page first.</p>}
            {stockList.length > 0 && lines.length === 0 && <p className="mt-2 text-sm text-ink-2">Nothing yet — selling this won’t use stock.</p>}

            {/* each line is its own tiny form, so its × button knows which line to remove */}
            {lines.map((l) => {
                const s = stockOf(l.stock_item_id);
                return (
                    <form key={l.stock_item_id} action={removeRecipeLine} className="mt-2 flex items-center gap-2 rounded-xl bg-tint px-3 py-2">
                        <input type="hidden" name="menu_item_id" value={menuItemId} />
                        <input type="hidden" name="stock_item_id" value={l.stock_item_id} />
                        <span className="font-semibold">{s?.name ?? "?"}</span>
                        <span className="ml-auto">
                            {Number(l.qty)} {s?.unit}
                        </span>
                        <button aria-label={`Remove ${s?.name}`} className="px-1 text-lg font-bold text-red-700">
                            ×
                        </button>
                    </form>
                );
            })}

            {/* add a line: pick a stock item that isn't in the recipe yet + how much */}
            {notUsedYet.length > 0 && (
                <form action={saveRecipeLine} className="mt-3 flex gap-2">
                    <input type="hidden" name="menu_item_id" value={menuItemId} />
                    <select name="stock_item_id" aria-label="Stock item" className="h-11 min-w-0 flex-1 rounded-xl bg-tint px-2 font-semibold">
                        {notUsedYet.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name} ({s.unit})
                            </option>
                        ))}
                    </select>
                    <input name="qty" inputMode="decimal" placeholder="qty" required aria-label="Amount used" className="h-11 w-20 rounded-xl bg-tint px-2 text-right font-semibold" />
                    <button className="h-11 rounded-xl bg-primary px-3 font-bold text-white">Add</button>
                </form>
            )}
        </div>
    );
}