import Link from "next/link";
import { Suspense } from "react";
import { getBusiness } from "@/lib/business";
import { supabase } from "@/lib/supabase";
import { addCategory, deleteCategory, updateCategory } from "./actions";

// "/menu/categories" = manage categories; "?error=…" = show a message from the last save
export default function CategoriesPage({ searchParams }: PageProps<"/menu/categories">) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Categories searchParams={searchParams} />
        </Suspense>
    );
}

async function Categories({ searchParams }: { searchParams: PageProps<"/menu/categories">["searchParams"] }) {
    const params = await searchParams;
    const errorMessage = typeof params.error === "string" ? params.error : null;

    const business = await getBusiness();
    if (!business) return <p className="p-6 text-red-600">Shop not found</p>;

    // both questions at the same time
    const [{ data: categories, error }, { data: items }] = await Promise.all([
        supabase.from("categories").select("id, name, station").eq("business_id", business.id).order("sort_order"),
        supabase.from("menu_items").select("category_id").eq("business_id", business.id),
    ]);
    if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

    const list = categories ?? [];
    const countFor = (id: string) => (items ?? []).filter((i) => i.category_id === id).length;

    return (
        <div className="flex max-w-3xl flex-col gap-5 p-6">
            {/* HEADER */}
            <div className="flex items-center gap-3">
                <div className="mr-auto">
                    <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
                    <p className="text-sm text-ink-2">Bar items print on the drinks ticket, Kitchen items on the kitchen ticket.</p>
                </div>
                <Link href="/menu" className="rounded-2xl border border-line bg-surface px-5 py-3 font-semibold">
                    ‹ Back to menu
                </Link>
            </div>

            {/* ERROR MESSAGE from the last save (e.g. name already exists) */}
            {errorMessage && <p className="rounded-2xl bg-red-50 p-4 font-semibold text-red-700">{errorMessage}</p>}

            {/* ADD A CATEGORY */}
            <form action={addCategory} className="flex gap-2 rounded-2xl border border-line bg-surface p-4">
                <input name="name" required maxLength={30} placeholder="New category, e.g. Pastries" className={INPUT + " flex-1"} />
                <StationSelect />
                <button className="h-11 rounded-xl bg-primary px-5 font-bold text-white">+ Add</button>
            </form>

            {/* THE LIST: each row = a rename form + a delete form */}
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                {list.length === 0 && <p className="p-10 text-center text-ink-2">No categories yet</p>}

                {list.map((c) => {
                    const n = countFor(c.id);
                    return (
                        <div key={c.id} className="flex items-center gap-2 border-b border-line p-3 last:border-b-0">
                            <form action={updateCategory} className="flex min-w-0 flex-1 items-center gap-2">
                                <input type="hidden" name="id" value={c.id} />
                                <input name="name" defaultValue={c.name} required maxLength={30} className={INPUT + " min-w-0 flex-1"} />
                                <StationSelect value={c.station} />
                                <span className="w-16 text-center text-sm text-ink-2">
                                    {n} item{n === 1 ? "" : "s"}
                                </span>
                                <button className="h-11 rounded-xl bg-tint px-4 font-semibold">Save</button>
                            </form>
                            <form action={deleteCategory}>
                                <input type="hidden" name="id" value={c.id} />
                                <button className="h-11 rounded-xl px-3 font-semibold text-red-700 hover:bg-red-50">Delete</button>
                            </form>
                        </div>
                    );
                })}
            </div>

            <p className="text-sm text-ink-2">Deleting a category keeps its items. They move to &quot;No category&quot;.</p>
        </div>
    );
}

// one look for every text box on this page
const INPUT = "h-11 rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary";

// Bar / Kitchen dropdown, used by the add form and by every row
function StationSelect({ value = "kitchen" }: { value?: string }) {
    return (
        <select name="station" defaultValue={value} className="h-11 rounded-xl bg-tint px-3 font-semibold outline-none focus:ring-2 focus:ring-primary">
            <option value="bar">Bar (drinks)</option>
            <option value="kitchen">Kitchen</option>
        </select>
    );
}