import Link from "next/link";
import { Suspense } from "react";

import { getBusiness } from "@/lib/business";
import { formatRM, toSen } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { addGroup, addOption, deleteGroup, removeOption, toggleRequired } from "./actions";

// "/menu/options" = make and edit option groups (Temperature: Hot / Iced, Milk: Fresh / Oat…)
export default function OptionsPage({ searchParams }: PageProps<"/menu/options">) {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <Options searchParams={searchParams} />
    </Suspense>
  );
}

const INPUT = "h-11 rounded-xl bg-tint px-3 font-semibold outline-none focus:ring-2 focus:ring-primary";

async function Options({ searchParams }: { searchParams: PageProps<"/menu/options">["searchParams"] }) {
  const params = await searchParams;
  const business = await getBusiness();
  if (!business) return <p className="p-6 text-red-600">Shop not found</p>;

  // option groups are public menu data → the anon key can read them
  const { data: groups, error } = await supabase
    .from("option_groups")
    .select("id, name, required, options(id, name, price, sort_order)")
    .eq("business_id", business.id)
    .order("sort_order")
    .order("sort_order", { referencedTable: "options" });
  if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <div>
        <Link href="/menu" className="text-sm font-semibold text-primary">
          ‹ Menu
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Option groups</h1>
        <p className="text-sm text-ink-2">Choices a customer makes, like Temperature (Hot / Iced) or Milk (Fresh / Oat +RM 2.00)</p>
      </div>

      {typeof params.msg === "string" && <p className="rounded-xl bg-green-50 p-3 font-semibold text-green-800">{params.msg}</p>}
      {typeof params.error === "string" && <p className="rounded-xl bg-red-50 p-3 font-semibold text-red-700">{params.error}</p>}

      {/* NEW GROUP */}
      <form action={addGroup} className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4">
        <label className="flex min-w-48 flex-1 flex-col text-sm font-semibold text-ink-2">
          New group
          <input name="name" required maxLength={40} placeholder="e.g. Sugar level" className={`${INPUT} mt-1`} />
        </label>
        <label className="flex h-11 items-center gap-2 font-semibold">
          <input type="checkbox" name="required" className="h-5 w-5 accent-primary" />
          Must pick one
        </label>
        <button className="h-11 rounded-xl bg-primary px-5 font-bold text-white">Add group</button>
      </form>

      {(groups ?? []).length === 0 && <p className="text-center text-ink-2">No option groups yet</p>}

      {/* ONE CARD PER GROUP */}
      {(groups ?? []).map((g) => (
        <section key={g.id} className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center gap-3">
            <h2 className="mr-auto text-lg font-bold">{g.name}</h2>

            {/* the badge IS the button: tap to switch required ↔ optional */}
            <form action={toggleRequired}>
              <input type="hidden" name="id" value={g.id} />
              <input type="hidden" name="required" value={String(g.required)} />
              <button
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${g.required ? "bg-primary text-white" : "bg-tint text-ink-2"}`}
                title="Tap to change"
              >
                {g.required ? "Must pick one" : "Optional"}
              </button>
            </form>

            <form action={deleteGroup}>
              <input type="hidden" name="id" value={g.id} />
              <input type="hidden" name="name" value={g.name} />
              <button className="text-sm font-semibold text-red-700 underline">Delete group</button>
            </form>
          </div>

          {/* the choices */}
          <div className="mt-3 flex flex-wrap gap-2">
            {g.options.length === 0 && <p className="text-sm text-ink-2">No choices yet</p>}
            {g.options.map((o) => (
              <form key={o.id} action={removeOption} className="flex items-center gap-2 rounded-xl bg-tint py-1 pr-1 pl-3">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="name" value={o.name} />
                <span className="font-semibold">{o.name}</span>
                {toSen(o.price) > 0 && <span className="text-sm text-ink-2">+{formatRM(toSen(o.price))}</span>}
                <button aria-label={`Remove ${o.name}`} className="px-2 text-lg font-bold text-red-700">
                  ×
                </button>
              </form>
            ))}
          </div>

          {/* add a choice to THIS group */}
          <form action={addOption} className="mt-3 flex gap-2">
            <input type="hidden" name="group_id" value={g.id} />
            <input name="name" required maxLength={40} placeholder="New choice, e.g. Less sweet" aria-label={`New choice for ${g.name}`} className={`${INPUT} min-w-0 flex-1`} />
            <input name="price" inputMode="decimal" placeholder="+RM (free)" aria-label={`Extra price for ${g.name}`} className={`${INPUT} w-40`} />
            <button className="h-11 rounded-xl border-2 border-primary px-4 font-bold text-primary">Add</button>
          </form>
        </section>
      ))}
    </div>
  );
}