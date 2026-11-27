import { CirclePlus, LayoutGrid, Lock, Pencil, Search, SlidersHorizontal, Tags, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { getBusiness } from "@/lib/business";
import { formatRM, toSen } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toggleShowInApp, toggleSoldOut } from "./actions";
import { ItemEditor } from "./item-editor";
import { PhotoUpload } from "./photo-upload";
import { RecipeEditor } from "./recipe-editor";
import { ItemOptionGroups } from "./item-option-groups";
import { DeleteItemButton } from "./delete-item-button";
import { Loading } from "@/components/loading";
import { HqMenuStrip } from "@/components/hq-menu-strip";
import { pauseInAllOutlets } from "@/components/hq-actions";
import { hqContext } from "@/lib/hq";
import { SubmitButton } from "@/components/submit-button";

// "/merchant/menu" = Menu management. The address remembers what you picked:
//   ?cat=<id> category   ?s=in / out  stock filter   ?q=latte  search   ?item=12 / ?item=new  the editor
export default function MenuPage({ searchParams }: PageProps<"/merchant/menu">) {
    return (
        <Suspense fallback={<Loading />}>
            <MenuContent searchParams={searchParams} />
        </Suspense>
    );
}

const STOCK_TABS = [
    { id: "all", label: "All" },
    { id: "in", label: "In stock" },
    { id: "out", label: "Sold out" },
] as const;
type StockTab = (typeof STOCK_TABS)[number]["id"];

async function MenuContent({ searchParams }: { searchParams: PageProps<"/merchant/menu">["searchParams"] }) {
    const params = await searchParams;
    await connection(); // "how many left" depends on the stock right now
    const cat = typeof params.cat === "string" ? params.cat : null;
    const s: StockTab = params.s === "in" || params.s === "out" ? params.s : "all";
    const q = typeof params.q === "string" ? params.q.trim() : "";
    const isNew = params.item === "new";
    const itemId = typeof params.item === "string" && !isNew ? Number(params.item) : null;

    const business = await getBusiness();
    if (!business) return <p className="p-6 text-danger">Shop not found</p>;
    const hq = await hqContext(); // HQ user on the master-menu outlet → "Pause in all outlets"

    // everything AT THE SAME TIME (one wait instead of four)
    const [{ data: categories }, { data: items, error: itemsError }, { data: recipes }, { data: stock }] = await Promise.all([
        supabase.from("categories").select("id, name, station").eq("business_id", business.id).order("sort_order"),
        supabase
            .from("menu_items")
            .select("id, name, description, image_url, price, category_id, is_available, show_in_app, hq_id, hq_off, menu_item_option_groups(group_id)")
            .eq("business_id", business.id)
            .order("name"),
        // recipes + stock are private → secret key (this file runs on the server)
        supabaseAdmin.from("menu_item_recipes").select("menu_item_id, stock_item_id, qty").eq("business_id", business.id),
        supabaseAdmin.from("stock_items").select("id, qty").eq("business_id", business.id),
    ]);
    if (itemsError) return <p className="p-6 text-danger">Error: {itemsError.message}</p>;

    const allItems = items ?? [];
    const onHand = new Map((stock ?? []).map((x) => [x.id, Number(x.qty)]));
    // how many can still be made from the stock (null = no recipe → never runs out)
    const left = (id: number) => {
        const lines = (recipes ?? []).filter((r) => r.menu_item_id === id);
        if (lines.length === 0) return null;
        return Math.min(...lines.map((r) => Math.floor((onHand.get(r.stock_item_id) ?? 0) / Number(r.qty))));
    };

    const needle = q.toLowerCase();
    const shown = allItems.filter(
        (i) =>
            (!cat || i.category_id === cat) &&
            (s === "all" || (s === "in" ? i.is_available : !i.is_available)) &&
            (!needle || `${i.name} ${i.description ?? ""}`.toLowerCase().includes(needle)),
    );
    const live = allItems.filter((i) => i.is_available).length;
    const categoryName = (id: string | null) => categories?.find((c) => c.id === id)?.name ?? "No category";
    const selected = allItems.find((i) => i.id === itemId);
    const editing = selected !== undefined || isNew;

    // build an address that keeps the other choices
    const href = (change: { cat?: string | null; s?: StockTab; item?: number | "new" | null }) => {
        const next = { cat, s, q, item: selected?.id ?? (isNew ? "new" : null), ...change };
        const sp = new URLSearchParams();
        if (next.cat) sp.set("cat", next.cat);
        if (next.s !== "all") sp.set("s", next.s);
        if (next.q) sp.set("q", next.q);
        if (next.item !== null) sp.set("item", String(next.item));
        return `/merchant/menu${sp.size ? `?${sp}` : ""}`;
    };

    return (
        <div className="flex h-full flex-col">
            {/* HQ only: push this menu to every outlet (or where this outlet's menu comes from) */}
            <HqMenuStrip
                area="/merchant"
                pushed={typeof params.pushed === "string" ? params.pushed : undefined}
                error={typeof params.push_error === "string" ? params.push_error : undefined}
            />
            {/* HEADER */}
            <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-4 lg:px-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tint text-primary">
                    <UtensilsCrossed className="h-6 w-6" />
                </span>
                <div className="mr-auto">
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        Menu management
                        <span className="label-caps flex items-center gap-1 rounded-md bg-tint px-2 py-1 text-ink-2">
                            <Lock className="h-3 w-3" />
                            Manager
                        </span>
                    </h1>
                    <p className="text-sm text-ink-2">
                        {allItems.length} items · {live} in stock · {categories?.length ?? 0} categories
                    </p>
                </div>
                {/* a plain GET form: Enter reloads with ?q=… */}
                <form action="/merchant/menu" className="relative w-56 xl:w-72">
                    {cat && <input type="hidden" name="cat" value={cat} />}
                    {s !== "all" && <input type="hidden" name="s" value={s} />}
                    <label>
                        <span className="sr-only">Search items</span>
                        <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink-3" />
                        <input
                            name="q"
                            type="search"
                            defaultValue={q}
                            placeholder="Search items…"
                            className="h-12 w-full rounded-xl bg-tint pr-4 pl-12 outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-primary-soft"
                        />
                    </label>
                </form>
                <div role="tablist" aria-label="Stock" className="flex gap-1 rounded-xl bg-tint p-1">
                    {STOCK_TABS.map((t) => (
                        <Link
                            key={t.id}
                            href={href({ s: t.id })}
                            role="tab"
                            aria-selected={t.id === s}
                            className={`press flex h-10 items-center rounded-lg px-4 text-sm font-semibold ${
                                t.id === s ? "bg-surface text-ink shadow-card" : "text-ink-2"
                            }`}
                        >
                            {t.label}
                        </Link>
                    ))}
                </div>
                <Link href="/merchant/menu/options" className="btn-soft flex h-12 items-center gap-2 px-4">
                    <SlidersHorizontal className="h-5 w-5" />
                    Option groups
                </Link>
                <Link href={href({ item: "new" })} className="btn-primary flex h-12 items-center gap-2 px-5">
                    <CirclePlus className="h-5 w-5" />
                    Add item
                </Link>
            </div>

            {/* 3 COLUMNS (below lg: one at a time) */}
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row lg:gap-5 lg:p-6">
                {/* LEFT: categories */}
                <nav
                    aria-label="Categories"
                    className={`${editing ? "hidden" : "flex"} card shrink-0 gap-1 overflow-x-auto p-2 lg:block lg:w-52 lg:self-start lg:p-3 xl:w-60`}
                >
                    <p className="label-caps hidden px-2 pt-1 pb-2 text-ink-2 lg:block">Categories</p>
                    <CategoryLink href={href({ cat: null, item: null })} name="All items" count={allItems.length} active={!cat} all />
                    {categories?.map((c) => (
                        <CategoryLink
                            key={c.id}
                            href={href({ cat: c.id, item: null })}
                            name={c.name}
                            count={allItems.filter((i) => i.category_id === c.id).length}
                            active={cat === c.id}
                        />
                    ))}
                    <Link href="/merchant/menu/categories" className="mt-3 hidden items-center gap-2 border-t border-line px-2 pt-3 text-sm font-semibold text-primary lg:flex">
                        <Tags className="h-4 w-4" />
                        Manage categories ›
                    </Link>
                </nav>

                {/* MIDDLE: item cards */}
                <section className={`${editing ? "hidden lg:flex" : "flex"} no-scrollbar min-w-0 flex-1 flex-col gap-3 overflow-y-auto pb-6`}>
                    {shown.length === 0 && <p className="py-16 text-center text-ink-3">No items match</p>}

                    {shown.map((i) => {
                        const n = left(i.id);
                        const groups = i.menu_item_option_groups.length;
                        const status = i.hq_off
                            ? { text: "Unavailable (HQ)", tone: "text-ink-2" }
                            : !i.is_available
                            ? { text: "Sold out", tone: "text-danger" }
                            : n === null
                              ? { text: "On menu", tone: "text-success" }
                              : n > 0
                                ? { text: `${n} left`, tone: n <= 5 ? "text-warning" : "text-success" }
                                : { text: "No stock", tone: "text-danger" };
                        return (
                            <div
                                key={i.id}
                                className={`card flex items-center gap-3 p-3 xl:gap-4 ${
                                    i.id === itemId ? "border-2 border-primary-soft" : "hover:border-primary-soft"
                                } ${i.is_available ? "" : "opacity-70"}`}
                            >
                                {/* the clickable part opens the editor */}
                                <Link href={href({ item: i.id })} scroll={false} className="flex min-w-0 flex-1 items-center gap-3 xl:gap-4">
                                    <Picture name={i.name} url={i.image_url} grey={!i.is_available} />
                                    <div className="min-w-0 flex-1">
                                        <p className="flex flex-wrap items-center gap-x-2 font-semibold xl:text-lg">
                                            {i.name}
                                            {i.hq_off ? (
                                                <span className="label-caps flex items-center gap-1 rounded bg-tint px-1.5 py-0.5 text-ink-2">
                                                    <Lock className="h-3 w-3" />
                                                    Unavailable (HQ)
                                                </span>
                                            ) : (
                                                !i.is_available && <span className="label-caps rounded bg-danger/10 px-1.5 py-0.5 text-danger">Sold out</span>
                                            )}
                                            {i.hq_id != null && <span className="label-caps rounded bg-tint px-1.5 py-0.5 text-ink-3">From HQ</span>}
                                        </p>
                                        {i.description && <p className="truncate text-sm text-ink-2">{i.description}</p>}
                                        <p className="mt-1 text-sm">
                                            <span className="money text-lg font-bold text-primary">{formatRM(toSen(i.price))}</span>
                                            <span className="hidden text-ink-3 xl:inline">
                                                {" "}
                                                · {categoryName(i.category_id)}
                                                {groups > 0 && ` · ${groups} option group${groups > 1 ? "s" : ""}`}
                                            </span>
                                        </p>
                                    </div>
                                </Link>

                                <div className="flex flex-col items-center gap-1">
                                    <span className={`label-caps money ${status.tone}`}>{status.text}</span>
                                    {/* quick sold-out switch without opening the editor (locked while HQ has it paused) */}
                                    {i.hq_off ? (
                                        <Lock className="h-5 w-5 text-ink-3" aria-label="Paused by HQ" />
                                    ) : (
                                        <form action={toggleSoldOut}>
                                            <input type="hidden" name="id" value={i.id} />
                                            <input type="hidden" name="available" value={String(i.is_available)} />
                                            <Switch on={i.is_available} label={`${i.name} available`} />
                                        </form>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </section>

                {/* RIGHT: editor */}
                <aside className={`${editing ? "flex" : "hidden lg:flex"} card no-scrollbar w-full shrink-0 flex-col self-start overflow-y-auto lg:w-[360px] xl:w-[420px]`}>
                    {editing && (
                        <Link href={href({ item: null })} className="block px-5 pt-4 font-semibold text-primary lg:hidden">
                            ← Back to items
                        </Link>
                    )}
                    {selected ? (
                        <>
                            {/* picture + the two switches */}
                            <div className="px-5 pt-5">
                                <div className="space-y-3 rounded-2xl bg-tint p-3">
                                    {/* photo + Upload / Change / Remove */}
                                    {selected.hq_id == null ? (
                                        <PhotoUpload key={selected.image_url ?? "none"} itemId={selected.id} name={selected.name} url={selected.image_url} />
                                    ) : (
                                        // pushed from HQ: name, price, photo and add-ons are changed at HQ
                                        <p className="flex items-start gap-2 text-sm text-ink-2">
                                            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                                            This item comes from HQ. Its name, price, photo and add-ons are set by HQ; you can mark it Sold out and set its recipe.
                                        </p>
                                    )}
                                    <div className="space-y-2 border-t border-line pt-3 text-sm font-semibold">
                                        {selected.hq_off ? (
                                            <p className="flex items-center justify-between gap-2 text-ink-2">
                                                Unavailable (HQ): paused in all outlets
                                                <Lock className="h-4 w-4" />
                                            </p>
                                        ) : (
                                            <form action={toggleSoldOut} className="flex items-center justify-between gap-2">
                                                <input type="hidden" name="id" value={selected.id} />
                                                <input type="hidden" name="available" value={String(selected.is_available)} />
                                                Available on menu
                                                <Switch on={selected.is_available} label="Available on menu" />
                                            </form>
                                        )}
                                        {/* HQ only, on the master menu: pause / resume this item in EVERY outlet at once */}
                                        {hq.isHq && hq.isMaster && (
                                            <form action={pauseInAllOutlets} className="flex items-center justify-between gap-2">
                                                <input type="hidden" name="id" value={selected.id} />
                                                <input type="hidden" name="off" value={String(!selected.hq_off)} />
                                                Sell in all outlets (HQ)
                                                <Switch on={!selected.hq_off} label="Sell in all outlets" />
                                            </form>
                                        )}
                                        {selected.hq_id == null && (
                                            <form action={toggleShowInApp} className="flex items-center justify-between gap-2">
                                                <input type="hidden" name="id" value={selected.id} />
                                                <input type="hidden" name="shown" value={String(selected.show_in_app !== false)} />
                                                Show in customer app
                                                <Switch on={selected.show_in_app !== false} label="Show in customer app" />
                                            </form>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {/* key = a new key makes React start a fresh editor (clears the inputs) */}
                            {selected.hq_id == null && <ItemEditor key={selected.id} item={selected} categories={categories ?? []} />}
                            {selected.hq_id == null && <ItemOptionGroups menuItemId={selected.id} />}
                            <RecipeEditor menuItemId={selected.id} />
                            {selected.hq_id == null && <DeleteItemButton id={selected.id} name={selected.name} />}
                        </>
                    ) : isNew ? (
                        <ItemEditor key="new" item={{ id: null, name: "", description: null, price: "", category_id: cat }} categories={categories ?? []} />
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-ink-3">
                            <Pencil className="h-8 w-8" />
                            <p>Select an item to edit, or add a new one</p>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}

// the item photo, or its first letter on orange when there is no photo
function Picture({ name, url, grey }: { name: string; url: string | null; grey?: boolean }) {
    const size = "h-16 w-16 xl:h-20 xl:w-20";
    return (
        <div className={`${size} shrink-0 overflow-hidden rounded-xl ${grey ? "grayscale" : ""}`}>
            {url ? (
                // eslint-disable-next-line @next/next/no-img-element -- photos come from any web address the shop typed
                <img src={url} alt="" className="h-full w-full object-cover" />
            ) : (
                <div className="flex h-full w-full items-center justify-center bg-tint-3 text-2xl font-bold text-primary/60">{name.charAt(0) || "?"}</div>
            )}
        </div>
    );
}

// ON / OFF switch (a submit button inside its form): green knob right = on
function Switch({ on, label }: { on: boolean; label: string }) {
    return (
        <SubmitButton spinner={false} role="switch" aria-checked={on} aria-label={label} className={`press relative h-8 w-14 shrink-0 rounded-full transition ${on ? "bg-success" : "bg-line"}`}>
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
        </SubmitButton>
    );
}

// ONE CATEGORY BUTTON in the left list. Active = orange with white text.
function CategoryLink({ href, name, count, active, all }: { href: string; name: string; count: number; active: boolean; all?: boolean }) {
    return (
        <Link
            href={href}
            className={`press flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 font-semibold whitespace-nowrap lg:mb-1 ${
                active ? "bg-primary-soft text-on-primary" : "hover:bg-tint"
            }`}
        >
            {all && <LayoutGrid className="h-5 w-5" />}
            <span className="flex-1">{name}</span>
            <span className={`money rounded-full px-2 text-xs ${active ? "bg-white/20" : "bg-tint text-ink-2"}`}>{count}</span>
        </Link>
    );
}
