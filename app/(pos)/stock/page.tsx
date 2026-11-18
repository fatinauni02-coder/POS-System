import { Ban, CircleX, History, Minus, Package, Pencil, Plus, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { OptionEffects } from "./option-effects";
import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addStockItem, adjustStock, updateStockItem } from "./actions";
import { DeleteStockButton } from "./delete-stock-button";
import { Toast } from "@/components/toast";
import { Loading } from "@/components/loading";
import { SubmitButton } from "@/components/submit-button";

// "/stock" — the address remembers what you picked:
//   ?f=low / out   filter      ?q=milk   search      ?edit=<id> / ?edit=new   the edit pop-up
export default function StockPage({ searchParams }: PageProps<"/stock">) {
    return (
        <Suspense fallback={<Loading />}>
            <Stock searchParams={searchParams} />
        </Suspense>
    );
}

const INPUT = "mt-1 h-12 w-full rounded-xl bg-tint px-3 font-semibold text-ink outline-none focus:ring-2 focus:ring-primary-soft";
const UNITS = ["pcs", "g", "kg", "ml", "l"];
const LEVEL = {
    ok: { label: "In stock", chip: "bg-success/10 text-success", bar: "bg-success" },
    low: { label: "Low", chip: "bg-warning/15 text-warning", bar: "bg-warning" },
    out: { label: "Out", chip: "bg-danger/10 text-danger", bar: "bg-danger" },
};
const FILTERS = ["all", "low", "out"] as const;
type Filter = (typeof FILTERS)[number];

async function Stock({ searchParams }: { searchParams: PageProps<"/stock">["searchParams"] }) {
    const params = await searchParams;
    const editId = typeof params.edit === "string" ? params.edit : null;
    const filter: Filter = FILTERS.includes(params.f as Filter) ? (params.f as Filter) : "all";
    const q = typeof params.q === "string" ? params.q.trim() : "";
    await connection(); // always show the amounts as they are right now

    const business = await getBusiness();
    if (!business) return <p className="p-6 text-danger">Shop not found</p>;

    // stock + recipes are private (RLS: staff only) → read them with the secret key, on the server
    const [{ data: items, error }, { data: recipes }, { data: menu }] = await Promise.all([
        supabaseAdmin.from("stock_items").select("id, name, unit, qty, low_level").eq("business_id", business.id).order("name"),
        supabaseAdmin.from("menu_item_recipes").select("menu_item_id, stock_item_id, qty").eq("business_id", business.id),
        supabaseAdmin.from("menu_items").select("id, name, is_available").eq("business_id", business.id).order("name"),
    ]);
    if (error) return <p className="p-6 text-danger">Error: {error.message}</p>;

    const all = (items ?? []).map((s) => {
        const qty = Number(s.qty);
        const low = Number(s.low_level);
        const status: keyof typeof LEVEL = qty <= 0 ? "out" : qty <= low ? "low" : "ok";
        return { ...s, qty, low, status };
    });
    const count = (f: Filter) => (f === "all" ? all.length : all.filter((s) => s.status === f).length);

    // "Used in": which menu items have this stock in their recipe
    const menuName = new Map((menu ?? []).map((m) => [m.id, m.name]));
    const usedIn = (stockId: string) => [
        ...new Set((recipes ?? []).filter((r) => r.stock_item_id === stockId).map((r) => menuName.get(r.menu_item_id) ?? "?")),
    ];
    // menu items switched on, but not enough stock to make one → shown as sold out at the till
    const onHand = new Map(all.map((s) => [s.id, s.qty]));
    const blocked = (menu ?? []).filter(
        (m) => m.is_available && (recipes ?? []).some((r) => r.menu_item_id === m.id && (onHand.get(r.stock_item_id) ?? 0) < Number(r.qty)),
    ).length;

    const list = all.filter((s) => (filter === "all" || s.status === filter) && (!q || s.name.toLowerCase().includes(q.toLowerCase())));
    const editing = editId === "new" ? "new" : all.find((s) => String(s.id) === editId);

    // address for a filter tab (keeps the search)
    const tabHref = (f: Filter) => {
        const sp = new URLSearchParams();
        if (f !== "all") sp.set("f", f);
        if (q) sp.set("q", q);
        return `/stock${sp.size ? `?${sp}` : ""}`;
    };
    const here = tabHref(filter); // where "Cancel" goes back to

    const stats = [
        { label: "Running low", n: count("low"), Icon: TriangleAlert, tone: "text-warning", sub: "At or under their low level" },
        { label: "Out of stock", n: count("out"), Icon: CircleX, tone: "text-danger", sub: "Need a delivery" },
        { label: "Menu items blocked", n: blocked, Icon: Ban, tone: "text-danger", sub: "Shown as “Sold out” at the till" },
    ];

    return (
        <div className="flex flex-col">
            {/* green / red message → pop-up at the bottom-right; key = new time → new toast */}
            {typeof params.msg === "string" && <Toast key={String(params.t)} kind="msg" text={params.msg} />}
            {typeof params.error === "string" && <Toast key={String(params.t)} kind="error" text={params.error} />}

            {/* HEADER */}
            <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-6 py-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tint text-primary">
                    <Package className="h-6 w-6" />
                </span>
                <div className="mr-auto">
                    <h1 className="text-2xl font-bold tracking-tight">Stock</h1>
                    <p className="text-sm text-ink-2">Goes down automatically with every sale · add deliveries here</p>
                </div>
                {/* a plain GET form: Enter reloads with ?q=… */}
                <form action="/stock" className="relative">
                    {filter !== "all" && <input type="hidden" name="f" value={filter} />}
                    <label>
                        <span className="sr-only">Search stock</span>
                        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
                        <input
                            name="q"
                            type="search"
                            defaultValue={q}
                            placeholder="Search stock"
                            className="h-12 w-56 rounded-xl border border-line bg-surface pr-3 pl-9 outline-none focus:border-primary-soft"
                        />
                    </label>
                </form>
                <Link href="/stock/history" className="btn-soft flex h-12 items-center gap-2 px-4">
                    <History className="h-5 w-5" />
                    History
                </Link>
                <Link href={`${here}${here.includes("?") ? "&" : "?"}edit=new`} scroll={false} className="btn-primary flex h-12 items-center gap-2 px-5">
                    <Plus className="h-5 w-5" />
                    New stock item
                </Link>
            </div>

            <main className="flex flex-col gap-5 p-6">
                {/* STATS */}
                <div className="grid gap-4 sm:grid-cols-3">
                    {stats.map(({ label, n, Icon, tone, sub }) => (
                        <div key={label} className="card flex items-center gap-4 p-4">
                            <span className={`flex h-12 w-12 items-center justify-center rounded-xl bg-tint ${tone}`}>
                                <Icon className="h-6 w-6" />
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-ink-2">{label}</p>
                                <p className="money text-2xl font-bold">{n}</p>
                                <p className="text-xs text-ink-3">{sub}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* FILTER TABS */}
                <div role="tablist" className="flex w-fit gap-1 rounded-xl bg-tint p-1">
                    {FILTERS.map((f) => (
                        <Link
                            key={f}
                            href={tabHref(f)}
                            role="tab"
                            aria-selected={f === filter}
                            className={`press flex h-10 items-center rounded-lg px-4 text-sm font-semibold ${
                                f === filter ? "bg-primary-soft text-on-primary" : "text-ink-2 hover:bg-tint-3"
                            }`}
                        >
                            {f === "all" ? "All" : f === "low" ? "Low" : "Out"} ({count(f)})
                        </Link>
                    ))}
                </div>

                {/* TABLE */}
                <div className="card overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="label-caps bg-tint text-ink-2">
                            <tr>
                                <th className="px-5 py-3">Item</th>
                                <th className="hidden px-3 py-3 lg:table-cell">Used in</th>
                                <th className="px-3 py-3 text-right">On hand</th>
                                <th className="px-3 py-3">Status</th>
                                <th className="px-5 py-3 text-right">Update</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {list.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-16 text-center text-ink-3">
                                        {q ? "No stock matches" : all.length === 0 ? "No stock items yet — press New stock item" : "Nothing here"}
                                    </td>
                                </tr>
                            )}
                            {list.map((s) => {
                                const lvl = LEVEL[s.status];
                                const used = usedIn(s.id);
                                // bar: full at 3× the low level
                                const pct = Math.min(100, Math.round((s.qty / Math.max(s.low * 3, 1)) * 100));
                                return (
                                    <tr key={s.id}>
                                        <td className="px-5 py-4">
                                            <p className="font-semibold">{s.name}</p>
                                            <p className="text-xs text-ink-3">
                                                Low level:{" "}
                                                <span className="money">
                                                    {s.low} {s.unit}
                                                </span>
                                            </p>
                                        </td>
                                        <td className="hidden max-w-64 px-3 py-4 text-sm text-ink-2 lg:table-cell">
                                            {used.length ? (
                                                <>
                                                    {used.slice(0, 3).join(", ")}
                                                    {used.length > 3 && <span className="text-ink-3"> +{used.length - 3} more</span>}
                                                </>
                                            ) : (
                                                <span className="text-ink-3">Not used yet</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-4 text-right">
                                            <p className="money text-xl font-bold whitespace-nowrap">
                                                {s.qty.toLocaleString("en-MY")} <span className="text-sm font-semibold text-ink-2">{s.unit}</span>
                                            </p>
                                            <div className="mt-1 ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-tint">
                                                <div className={`h-full ${lvl.bar}`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </td>
                                        <td className="px-3 py-4">
                                            <span className={`label-caps rounded-md px-2 py-1 whitespace-nowrap ${lvl.chip}`}>{lvl.label}</span>
                                        </td>
                                        <td className="px-5 py-4">
                                            {/* one form, two buttons: the button you press decides the reason */}
                                            <form action={adjustStock} className="flex items-center justify-end gap-2">
                                                <input type="hidden" name="id" value={s.id} />
                                                <input type="hidden" name="name" value={s.name} />
                                                <input
                                                    name="qty"
                                                    inputMode="decimal"
                                                    placeholder="Amount"
                                                    aria-label={`Amount of ${s.name}`}
                                                    className="money h-11 w-24 rounded-xl bg-tint px-3 text-right font-semibold outline-none focus:ring-2 focus:ring-primary-soft"
                                                />
                                                {/* the first button = what Enter presses → Receive */}
                                                <SubmitButton name="reason" value="delivery" title="Delivery received" className="btn-soft flex h-11 items-center gap-1 px-3 text-sm text-success!">
                                                    <Plus className="h-4 w-4" />
                                                    Receive
                                                </SubmitButton>
                                                <SubmitButton name="reason" value="waste" title="Spoilt / spilled" className="btn-soft flex h-11 items-center gap-1 px-3 text-sm">
                                                    <Minus className="h-4 w-4" />
                                                    Waste
                                                </SubmitButton>
                                                <Link
                                                    href={`${here}${here.includes("?") ? "&" : "?"}edit=${s.id}`}
                                                    scroll={false}
                                                    aria-label={`Edit ${s.name}`}
                                                    className="press rounded-lg p-2 text-ink-2 hover:bg-tint"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Link>
                                            </form>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* OPTIONS THAT CHANGE STOCK (its own server component, loads its own data) */}
                <OptionEffects />
            </main>

            {/* EDIT / NEW POP-UP (opened by ?edit=…; Cancel = a link back without it) */}
            {editing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <Link href={here} scroll={false} aria-label="Close" className="absolute inset-0" />
                    <form
                        action={editing === "new" ? addStockItem : updateStockItem}
                        className="relative w-full max-w-md rounded-3xl bg-surface p-6 shadow-modal"
                    >
                        <h2 className="text-xl font-bold">{editing === "new" ? "New stock item" : `Edit ${editing.name}`}</h2>
                        {editing !== "new" && <input type="hidden" name="id" value={editing.id} />}
                        <div className="mt-4 space-y-3">
                            <label className="block text-sm font-semibold text-ink-2">
                                Name
                                <input
                                    name="name"
                                    required
                                    maxLength={60}
                                    autoFocus
                                    defaultValue={editing === "new" ? "" : editing.name}
                                    placeholder="e.g. Condensed milk"
                                    className={INPUT}
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="block text-sm font-semibold text-ink-2">
                                    Unit
                                    <select name="unit" defaultValue={editing === "new" ? "pcs" : editing.unit} className={INPUT}>
                                        {UNITS.map((u) => (
                                            <option key={u} value={u}>
                                                {u}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block text-sm font-semibold text-ink-2">
                                    Low level
                                    <input
                                        name="low_level"
                                        inputMode="decimal"
                                        defaultValue={editing === "new" ? "" : editing.low}
                                        placeholder="0"
                                        className={`money ${INPUT}`}
                                    />
                                </label>
                            </div>
                            <p className="text-xs text-ink-3">
                                {editing === "new"
                                    ? "Starts at 0 — use Receive to add the first delivery."
                                    : "Changing the unit doesn't convert the amount or recipes. Deleting also removes this item's stock history."}
                            </p>
                        </div>
                        <div className="mt-5 flex flex-wrap items-center gap-2">
                            {editing !== "new" && (
                                // Delete sends this same form (the id + name above) to deleteStockItem
                                <DeleteStockButton name={editing.name} />
                            )}
                            <Link href={here} scroll={false} className="btn-soft ml-auto flex h-12 items-center px-5">
                                Cancel
                            </Link>
                            <SubmitButton name="do" value="save" className="btn-primary h-12 px-6">
                                Save
                            </SubmitButton>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
