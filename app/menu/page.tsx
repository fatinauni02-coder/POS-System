import Link from "next/link";
import { Suspense } from "react";

import { getBusiness } from "@/lib/business";
import { supabase } from "@/lib/supabase";
import { toggleSoldOut } from "./actions";
import { ItemEditor } from "./item-editor";
import { RecipeEditor } from "./recipe-editor";
import { ItemOptionGroups } from "./item-option-groups";

// "/menu" = Menu management. Suspense shows "Loading…" while Supabase answers.
export default function MenuPage({ searchParams }: PageProps<"/menu">) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <MenuContent searchParams={searchParams} />
        </Suspense>
    );
}

async function MenuContent({ searchParams }: { searchParams: PageProps<"/menu">["searchParams"] }) {
    // ?cat=… in the address = which category is selected
    // ?item=12 = item 12 is open in the editor; ?item=new = empty "new item" editor
    const params = await searchParams;
    const cat = typeof params.cat === "string" ? params.cat : null;
    const isNew = params.item === "new";
    const itemId = typeof params.item === "string" && !isNew ? Number(params.item) : null;

    const business = await getBusiness();
    if (!business)
        return <p className="text-red-600">Shop not found</p>;

    // 2 categories
    const { data: categories } = await supabase
        .from("categories")
        .select("id, name, station")
        .eq("business_id", business.id)
        .order("sort_order");


    // 3 menu items
    const { data: items, error: itemsError } = await supabase
        .from("menu_items")
        .select("id, name, description, price, category_id, is_available")
        .eq("business_id", business.id)
        .order("name");

    if (itemsError)
        return <p className="text-red-600">Error: {itemsError.message}</p>;

    const allItems = items ?? [];
    const shown = cat ? allItems.filter((i) => i.category_id === cat) : allItems;
    const soldOut = allItems.filter((i) => !i.is_available).length;
    const categoryName = (id: string | null) => categories?.find((c) => c.id === id)?.name ?? "No category";
    const selected = allItems.find((i) => i.id === itemId);
    // helper to generate the link to an item, preserving the category filter if any
    const itemHref = (id: number) => (cat ? `/menu?cat=${cat}&item=${id}` : `/menu?item=${id}`);

    // PAGE SHAPE:
    //   ┌───────────────────────────────────────────────┐
    //   │ HEADER: title + counts            [+ Add item] │
    //   ├──────────┬─────────────────────┬──────────────┤
    //   │ LEFT     │ MIDDLE              │ RIGHT        │
    //   │ category │ item rows           │ item editor  │
    //   │ list     │ (scrolls)           │              │
    //   └──────────┴─────────────────────┴──────────────┘
    return (
        // h-full = fill the page area; flex-col = header on top, 3 columns below
        <div className="flex h-full flex-col">
            {/* HEADER
                items-center = title and button centred vertically
                border-b = line under it; px-6 py-4 = inner space (sides / top+bottom) */}
            <div className="flex items-center border-b border-line bg-surface px-6 py-4">
                {/* mr-auto = takes the free space, so the button is pushed to the right */}
                <div className="mr-auto">
                    <h1 className="text-2xl font-bold tracking-tight">Menu management</h1>
                    <p className="text-sm text-ink-2">
                        {allItems.length} items · {soldOut} sold out · {categories?.length ?? 0} categories
                    </p>
                </div>
                {/* link to the option groups page */}
                <Link href="/menu/options" className="mr-3 rounded-2xl border border-line px-5 py-3 font-semibold">
                    Option groups
                </Link>
                {/* "+ Add item" button: px-5 py-3 = button size, rounded-2xl = corners */}
                <Link href={cat ? `/menu?cat=${cat}&item=new` : "/menu?item=new"} className="rounded-2xl bg-primary px-5 py-3 font-bold text-white">
                    + Add item
                </Link>
            </div>

            {/* 3 COLUMNS
                flex = columns side by side; gap-5 = space between columns; p-6 = space around
                flex-1 = fill the height under the header
                min-h-0 = lets the middle column scroll instead of making the page taller */}
            <div className="flex min-h-0 flex-1 gap-5 p-6">
                {/* LEFT: categories
                    w-48 = width on normal screens; xl:w-60 = wider on big screens (≥1280px)
                    shrink-0 = keep that width; self-start = box only as tall as its content */}
                <nav className="w-48 shrink-0 xl:w-60 self-start rounded-2xl border border-line bg-surface p-3">
                    <p className="px-2 pb-2 text-[11px] font-bold tracking-wider text-ink-2 uppercase">Categories</p>
                    <CategoryLink href="/menu" name="All items" count={allItems.length} active={!cat} />
                    {categories?.map((c) => (
                        <CategoryLink
                            key={c.id}
                            href={`/menu?cat=${c.id}`}
                            name={c.name}
                            count={allItems.filter((i) => i.category_id === c.id).length}
                            active={cat === c.id}
                        />
                    ))}
                </nav>

                {/* MIDDLE: items
                    flex-1 = takes all the width the side columns don't use
                    min-w-0 = allows long names to be cut with "…" instead of widening the page
                    gap-3 = space between rows; overflow-y-auto = this column scrolls */}
                <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pb-6">
                    {shown.length === 0 && <p className="py-16 text-center text-ink-2">No items in this category yet</p>}

                    {shown.map((i) => (
                        // ONE ITEM ROW: picture | name + price | status | switch
                        // gap-4 = space between those parts; p-3 = inner space; rounded-2xl = corners
                        // the open item gets a thick orange border; sold-out rows are faded (opacity-60)
                        <div
                            key={i.id}
                            className={`flex items-center gap-4 rounded-2xl border bg-surface p-3 ${i.id === itemId ? "border-2 border-primary" : "border-line"} ${i.is_available ? "" : "opacity-60"}`}
                        >
                            {/* the clickable part (picture + text) opens the editor */}
                            <Link href={itemHref(i.id)} className="flex min-w-0 flex-1 items-center gap-4">
                                {/* PICTURE placeholder: h-16 w-16 = size; text-2xl = letter size */}
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-tint text-2xl font-bold text-primary/50">
                                    {i.name.charAt(0)}
                                </div>

                                {/* Price Line */}
                                {/* NAME / DESCRIPTION / PRICE (truncate = cut long text with "…") */}
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold">{i.name}</p>
                                    {i.description && <p className="truncate text-sm text-ink-2">{i.description}</p>}
                                    <p className="mt-1 text-sm">
                                        <span className="font-bold text-primary">RM {Number(i.price).toFixed(2)}</span>
                                        <span className="text-ink-2"> · {categoryName(i.category_id)}</span>
                                    </p>
                                </div>
                            </Link>

                            {/* STATUS label: green "On sale" / red "Sold out" */}
                            <span className={`text-[11px] font-bold uppercase ${i.is_available ? "text-green-700" : "text-red-700"}`}>
                                {i.is_available ? "On sale" : "Sold out"}
                            </span>

                            {/* ON-SALE SWITCH: a form that runs the toggleSoldOut Server Action */}
                            <form action={toggleSoldOut}>
                                <input type="hidden" name="id" value={i.id} />
                                <input type="hidden" name="available" value={String(i.is_available)} />
                                {/* the track: h-8 w-14 = switch size; green when on, grey when off */}
                                <button
                                    role="switch"
                                    aria-checked={i.is_available}
                                    aria-label={`${i.name} on sale`}
                                    className={`relative h-8 w-14 rounded-full transition ${i.is_available ? "bg-green-700" : "bg-line"}`}
                                >
                                    {/* the white knob: left-7 = right side (on), left-1 = left side (off) */}
                                    <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${i.is_available ? "left-7" : "left-1"}`} />
                                </button>
                            </form>
                        </div>
                    ))}
                </section>

                {/* RIGHT: editor
                    w-[300px] = width on normal screens; xl:w-[380px] = wider on big screens
                    self-start = only as tall as the form */}
                <aside className="w-[300px] shrink-0 self-start rounded-2xl border border-line bg-surface xl:w-[380px]">
                    {/* key = a new key makes React start a fresh editor (clears the inputs) */}
                    {selected ? (
                        <>
                            <ItemEditor key={selected.id} item={selected} categories={categories ?? []} />
                            <ItemOptionGroups menuItemId={selected.id} />
                            <RecipeEditor menuItemId={selected.id} />
                        </>
                    ) : isNew ? (
                        <ItemEditor
                            key="new"
                            item={{ id: null, name: "", description: null, price: "", category_id: cat }}
                            categories={categories ?? []}
                        />
                    ) : (
                        <p className="p-10 text-center text-ink-2">Select an item to edit</p>
                    )}
                </aside>
            </div>
        </div>
    );
}

// ONE CATEGORY BUTTON in the left list: name on the left, count bubble on the right
// (justify-between = push them to opposite ends). Active = orange with white text.
function CategoryLink({ href, name, count, active }: { href: string; name: string; count: number; active: boolean }) {
    return (
        <Link
            href={href}
            className={`mb-1 flex items-center justify-between rounded-xl px-3 py-2.5 font-semibold ${active ? "bg-primary-soft text-white" : "hover:bg-tint"
                }`}
        >
            {name}
            {/* count bubble: bg-white/20 = white at 20% (see-through) on the orange button */}
            <span className={`rounded-full px-2 text-xs ${active ? "bg-white/20" : "bg-tint text-ink-2"}`}>{count}</span>
        </Link>
    );
}
