import Link from "next/link";

import { getBusiness } from "@/lib/business";
import { supabase } from "@/lib/supabase";
import { setItemGroups } from "./actions";

// Tick which option groups this item asks for (e.g. Latte → Temperature + Milk; Croissant → none)
export async function ItemOptionGroups({ menuItemId }: { menuItemId: number }) {
  const business = await getBusiness();
  if (!business) return null;

  // both are public menu data → the anon key is fine
  const [{ data: groups }, { data: links }] = await Promise.all([
    supabase.from("option_groups").select("id, name, required").eq("business_id", business.id).order("sort_order"),
    supabase.from("menu_item_option_groups").select("group_id").eq("menu_item_id", menuItemId),
  ]);
  // a Set is a list with no duplicates and a fast "is it in here?" check: linked.has(id)
  const linked = new Set((links ?? []).map((l) => l.group_id));

  return (
    // key: a new set of ticks after saving makes React draw a fresh form (defaultChecked only applies once)
    <form key={[...linked].join(",")} action={setItemGroups} className="border-t border-line p-5">
      <input type="hidden" name="menu_item_id" value={menuItemId} />
      <div className="flex items-center">
        <p className="mr-auto text-[11px] font-bold tracking-wider text-ink-2 uppercase">Option groups</p>
        <Link href="/menu/options" className="text-sm font-semibold text-primary">
          Manage ›
        </Link>
      </div>

      {(groups ?? []).length === 0 && <p className="mt-2 text-sm text-ink-2">No option groups yet.</p>}

      {/* every checkbox has the SAME name; the server gets all ticked ones with formData.getAll("group_id") */}
      <div className="mt-2 flex flex-col gap-2">
        {(groups ?? []).map((g) => (
          <label key={g.id} className="flex items-center gap-3 rounded-xl bg-tint px-3 py-2">
            <input type="checkbox" name="group_id" value={g.id} defaultChecked={linked.has(g.id)} className="h-5 w-5 accent-primary" />
            <span className="font-semibold">{g.name}</span>
            {g.required && <span className="text-xs text-ink-2">(must pick one)</span>}
          </label>
        ))}
      </div>

      {(groups ?? []).length > 0 && (
        <button className="mt-3 h-11 w-full rounded-xl border-2 border-primary font-bold text-primary">Save option groups</button>
      )}
    </form>
  );
}