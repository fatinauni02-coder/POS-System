import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { formatRM, toSen } from "@/lib/money";

import { getBusiness } from "@/lib/business";
import { supabase } from "@/lib/supabase";
import { setItemGroups } from "./actions";

// Tick which option groups this item asks for (e.g. Latte → Temperature + Milk; Croissant → none)
export async function ItemOptionGroups({ menuItemId }: { menuItemId: number }) {
  const business = await getBusiness();
  if (!business) return null;

  // both are public menu data → the anon key is fine
  const [{ data: groups }, { data: links }] = await Promise.all([
    supabase
      .from("option_groups")
      .select("id, name, required, options(name, price, sort_order)")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("sort_order", { referencedTable: "options" }),
    supabase.from("menu_item_option_groups").select("group_id").eq("menu_item_id", menuItemId),
  ]);
  // a Set is a list with no duplicates and a fast "is it in here?" check: linked.has(id)
  const linked = new Set((links ?? []).map((l) => l.group_id));

  return (
    // key: a new set of ticks after saving makes React draw a fresh form (defaultChecked only applies once)
    <form key={[...linked].join(",")} action={setItemGroups} className="border-t border-line p-5">
      <input type="hidden" name="menu_item_id" value={menuItemId} />
      <div className="flex items-center">
        <p className="mr-auto flex items-center gap-2 font-bold">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          Option groups
        </p>
        <Link href="/menu/options" className="text-sm font-semibold text-primary">
          Manage ›
        </Link>
      </div>

      {(groups ?? []).length === 0 && <p className="mt-2 text-sm text-ink-2">No option groups yet.</p>}

      {/* every checkbox has the SAME name; the server gets all ticked ones with formData.getAll("group_id") */}
      <div className="mt-2 flex flex-col gap-2">
        {(groups ?? []).map((g) => (
          <label
            key={g.id}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-primary-soft has-[:checked]:bg-tint"
          >
            <input type="checkbox" name="group_id" value={g.id} defaultChecked={linked.has(g.id)} className="mt-1 h-4 w-4 accent-primary" />
            <span className="flex-1">
              <span className="font-semibold">{g.name}</span>
              <span className="label-caps ml-1 text-ink-3">{g.required ? "Required" : "Optional"}</span>
              <span className="block text-sm text-ink-2">
                {(g.options ?? []).map((o) => o.name + (toSen(o.price) ? ` (+${formatRM(toSen(o.price))})` : "")).join(" · ")}
              </span>
            </span>
          </label>
        ))}
      </div>

      {(groups ?? []).length > 0 && (
        <button className="btn-soft mt-3 h-11 w-full">Save option groups</button>
      )}
    </form>
  );
}