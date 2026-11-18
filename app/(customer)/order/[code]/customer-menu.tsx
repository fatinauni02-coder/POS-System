"use client"; // the cart lives on the customer's phone until they press "Send order"

import { Armchair, Info, Minus, Plus, Search, Send, ShoppingBag, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatRM, toSen } from "@/lib/money";
import { placeQrOrder } from "../actions";

// Look copied from the approved prototype: pos_html/order-qr.html + assets/pages/order-qr.js
// (sticky header with logo + table chip, photo cards, bottom sheets for options and "Your order").

type Option = { id: string; name: string; price: number | string; sort_order: number };
type Group = { id: string; name: string; required: boolean; options: Option[] };
type Item = {
    id: number;
    name: string;
    description: string | null;
    image_url: string | null;
    price: number | string;
    category_id: string | null;
    is_available: boolean;
    menu_item_option_groups: { group_id: string }[];
};
type Line = { key: string; itemId: number; name: string; options: string[]; optionIds: string[]; unitSen: number; qty: number; note: string };

type Props = {
    code: string;
    shopName: string;
    tagline: string | null;
    logoUrl: string | null;
    tableLabel: string | null; // null = counter QR (takeaway only)
    sstRate: number;
    categories: { id: string; name: string }[];
    items: Item[];
    groups: Group[];
};

// saved cart for THIS QR code (so a refresh on the phone doesn't lose it)
function loadCart(key: string): Line[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((l) => l.key && Array.isArray(l.optionIds)) : [];
    } catch {
        return [];
    }
}

const INPUT = "mt-1.5 h-12 w-full rounded-xl border border-line bg-canvas px-4 text-[16px] font-normal outline-none focus:border-primary-soft";

export function CustomerMenu({ code, shopName, tagline, logoUrl, tableLabel, sstRate, categories, items, groups }: Props) {
    const router = useRouter();
    const cartKey = `qr.cart.${code}`;
    const [cart, setCart] = useState<Line[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [activeCat, setActiveCat] = useState(categories[0]?.id ?? "all");
    const [search, setSearch] = useState("");
    const [picking, setPicking] = useState<Item | null>(null); // item sheet open
    const [reviewing, setReviewing] = useState(false); // "Your order" sheet open
    const [type, setType] = useState<"dine_in" | "takeaway">(tableLabel ? "dine_in" : "takeaway");
    const [name, setName] = useState("");
    const [note, setNote] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");

    // read the saved cart once on the phone (localStorage only exists in the browser)
    useEffect(() => {
        setCart(loadCart(cartKey)); // eslint-disable-line react-hooks/set-state-in-effect
        setLoaded(true);
    }, [cartKey]);
    useEffect(() => {
        if (loaded) localStorage.setItem(cartKey, JSON.stringify(cart));
    }, [cart, cartKey, loaded]);

    // only categories that have something in them
    const cats = categories.filter((c) => items.some((i) => i.category_id === c.id));
    const query = search.trim().toLowerCase();
    const shown = query
        ? items.filter((i) => i.name.toLowerCase().includes(query))
        : activeCat === "all"
          ? items
          : items.filter((i) => i.category_id === activeCat);
    const heading = query ? `Results for “${search.trim()}”` : (cats.find((c) => c.id === activeCat)?.name ?? "Menu");
    const groupsFor = (item: Item) => groups.filter((g) => item.menu_item_option_groups.some((l) => l.group_id === g.id));
    const inCart = (itemId: number) => cart.filter((l) => l.itemId === itemId).reduce((n, l) => n + l.qty, 0);

    function addLine(item: Item, chosen: Option[], qty: number, lineNote: string) {
        const key = `${item.id}|${chosen.map((o) => o.id).join(",")}|${lineNote}`;
        const unitSen = toSen(item.price) + chosen.reduce((sum, o) => sum + toSen(o.price), 0);
        setCart((lines) =>
            lines.some((l) => l.key === key)
                ? lines.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l))
                : [...lines, { key, itemId: item.id, name: item.name, options: chosen.map((o) => o.name), optionIds: chosen.map((o) => o.id), unitSen, qty, note: lineNote }],
        );
    }
    const changeQty = (key: string, by: number) =>
        setCart((lines) => lines.map((l) => (l.key === key ? { ...l, qty: l.qty + by } : l)).filter((l) => l.qty > 0));

    async function send() {
        setSending(true);
        setError("");
        const result = await placeQrOrder({
            code,
            type,
            name,
            note,
            lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty, optionIds: l.optionIds, note: l.note })),
        });
        if (!result.ok) {
            setSending(false);
            setError(result.message);
            return;
        }
        setCart([]);
        localStorage.setItem(cartKey, "[]");
        router.push(`/order/track/${result.id}`); // the status tracker
    }

    const count = cart.reduce((n, l) => n + l.qty, 0);
    const subtotal = cart.reduce((s, l) => s + l.unitSen * l.qty, 0);
    const sst = Math.round((subtotal * sstRate) / 100);
    const needsName = type === "takeaway" && name.trim() === "";

    return (
        <div className="flex min-h-dvh flex-col">
            {/* STICKY HEADER: logo + shop + table chip, search, category pills */}
            <header className="sticky top-0 z-20 border-b border-line bg-surface/95 px-4 pb-3 pt-4 backdrop-blur">
                <div className="flex items-center gap-3">
                    {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} alt="" className="h-11 w-11 rounded-xl object-cover" />
                    ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-on-primary">{shopName.charAt(0)}</span>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-bold leading-tight">{shopName}</p>
                        <p className="truncate text-sm text-ink-2">{tableLabel ? "Order from your table · pay at the counter" : (tagline ?? "Order here · pay at the counter")}</p>
                    </div>
                    <span className="label-caps flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-on-primary">
                        {tableLabel ? <Armchair className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
                        {tableLabel ? `Table ${tableLabel}` : "Takeaway"}
                    </span>
                </div>

                <label className="relative mt-3 block">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search menu"
                        className="h-11 w-full rounded-full border border-line bg-canvas pl-9 pr-10 text-[16px] outline-none focus:border-primary-soft"
                    />
                    {search && (
                        <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-xl text-ink-3">
                            ×
                        </button>
                    )}
                </label>

                {!query && (
                    <nav className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" aria-label="Categories">
                        {[...cats, { id: "all", name: "All" }].map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => setActiveCat(c.id)}
                                className={`press flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${
                                    c.id === activeCat ? "bg-primary text-on-primary" : "border border-line bg-surface text-ink-2"
                                }`}
                            >
                                {c.name}
                            </button>
                        ))}
                    </nav>
                )}
            </header>

            {/* MENU LIST: photo cards */}
            <main className="flex-1 px-4 pb-32 pt-3">
                <h2 className="mb-2 mt-1 text-lg font-bold">{heading}</h2>
                {shown.length === 0 && <p className="py-10 text-center text-ink-3">{query ? "No items match" : "Nothing here yet"}</p>}
                <ul className="flex flex-col gap-3">
                    {shown.map((item) => {
                        const n = inCart(item.id);
                        const out = !item.is_available;
                        return (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    disabled={out}
                                    onClick={() => setPicking(item)}
                                    className="card press flex w-full gap-3 p-2.5 text-left disabled:opacity-55 disabled:grayscale"
                                >
                                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl">
                                        <ItemImage item={item} />
                                        {n > 0 && (
                                            <span className="money absolute left-1 top-1 rounded-full bg-primary px-2 text-xs font-bold leading-5 text-on-primary">{n}</span>
                                        )}
                                    </div>
                                    <div className="flex min-w-0 flex-1 flex-col py-0.5">
                                        <span className="font-semibold leading-snug">{item.name}</span>
                                        {item.description && <span className="line-clamp-2 text-sm text-ink-2">{item.description}</span>}
                                        <span className="mt-auto flex items-center justify-between">
                                            <span className="money font-bold text-primary">{formatRM(toSen(item.price))}</span>
                                            {out ? (
                                                <span className="label-caps rounded-md bg-ink px-2 py-1 text-white">Sold out</span>
                                            ) : (
                                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary">
                                                    <Plus className="h-4 w-4" />
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </main>

            {/* BOTTOM BAR: open "Your order" */}
            {count > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <button
                        type="button"
                        onClick={() => setReviewing(true)}
                        className="btn-primary mx-auto flex h-14 w-full max-w-xl items-center justify-between px-5 text-base shadow-modal"
                    >
                        <span className="flex items-center gap-2">
                            <span className="money rounded-full bg-white/20 px-2 py-0.5 text-sm">{count}</span>
                            View order
                        </span>
                        <span className="money">{formatRM(subtotal)}</span>
                    </button>
                </div>
            )}

            {/* ITEM SHEET: photo, choices, request, qty, Add */}
            {picking && (
                <ItemSheet
                    item={picking}
                    groups={groupsFor(picking)}
                    onAdd={(chosen, qty, lineNote) => {
                        addLine(picking, chosen, qty, lineNote);
                        setPicking(null);
                    }}
                    onClose={() => setPicking(null)}
                />
            )}

            {/* "YOUR ORDER" SHEET */}
            {reviewing && (
                <Sheet onClose={() => setReviewing(false)}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold">Your order</h2>
                        <span className="label-caps rounded-md bg-tint px-2 py-1 text-primary">{tableLabel ? `Table ${tableLabel}` : "Takeaway"}</span>
                    </div>

                    {cart.length === 0 && <p className="py-10 text-center text-ink-3">Your order is empty</p>}
                    <ul className="mt-3 divide-y divide-line">
                        {cart.map((l) => (
                            <li key={l.key} className="flex items-center gap-3 py-3">
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold">{l.name}</p>
                                    {l.options.length > 0 && <p className="text-sm text-ink-2">{l.options.join(" · ")}</p>}
                                    {l.note && <p className="text-sm italic text-primary">“{l.note}”</p>}
                                    <p className="money text-sm font-bold">{formatRM(l.unitSen * l.qty)}</p>
                                </div>
                                <Stepper qty={l.qty} onLess={() => changeQty(l.key, -1)} onMore={() => changeQty(l.key, +1)} />
                            </li>
                        ))}
                    </ul>

                    {cart.length > 0 && (
                        <>
                            {/* DINE-IN / TAKEAWAY (a counter QR is takeaway only) */}
                            {tableLabel && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    {(["dine_in", "takeaway"] as const).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setType(t)}
                                            className={`press h-12 rounded-xl border-2 font-semibold ${type === t ? "border-primary-soft bg-tint text-primary" : "border-line"}`}
                                        >
                                            {t === "dine_in" ? "Dine-in" : "Takeaway"}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {type === "takeaway" && (
                                <label className="mt-3 block text-sm font-semibold">
                                    Your name <span className="font-normal text-ink-3">(we&apos;ll call you)</span>
                                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="e.g. Aina" className={INPUT} />
                                </label>
                            )}
                            <label className="mt-3 block text-sm font-semibold">
                                Note for the kitchen
                                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. allergic to peanuts" className={INPUT} />
                            </label>

                            <dl className="money mt-4 space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-ink-2">Subtotal</dt>
                                    <dd>{formatRM(subtotal)}</dd>
                                </div>
                                {sstRate > 0 && (
                                    <div className="flex justify-between">
                                        <dt className="text-ink-2">SST {sstRate}%</dt>
                                        <dd>{formatRM(sst)}</dd>
                                    </div>
                                )}
                                <div className="flex justify-between pt-1 text-lg font-bold">
                                    <dt>Total</dt>
                                    <dd className="text-primary">{formatRM(subtotal + sst)}</dd>
                                </div>
                            </dl>
                            <p className="mt-3 flex items-start gap-2 rounded-xl bg-tint-2 p-3 text-sm">
                                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                Pay at the counter (cash, card, DuitNow or e-wallet). Cash is rounded to the nearest 5 sen.
                            </p>
                            {error && <p className="mt-3 rounded-xl bg-danger/10 p-3 text-sm font-semibold text-danger">{error}</p>}
                            <button
                                type="button"
                                onClick={send}
                                disabled={needsName || sending}
                                className="btn-primary mt-4 flex h-14 w-full items-center justify-center gap-2 text-lg"
                            >
                                <Send className="h-5 w-5" />
                                {sending ? "Sending…" : needsName ? "Type your name first" : "Send order"}
                            </button>
                        </>
                    )}
                </Sheet>
            )}
        </div>
    );
}

// photo, or a letter tile when the item has no photo
function ItemImage({ item }: { item: Item }) {
    return item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" className="h-full w-full object-cover" />
    ) : (
        <span className="flex h-full w-full items-center justify-center bg-tint text-3xl font-bold text-primary/50">{item.name.charAt(0)}</span>
    );
}

// − 2 + (trash icon when it's the last one)
function Stepper({ qty, onLess, onMore, big = false }: { qty: number; onLess: () => void; onMore: () => void; big?: boolean }) {
    const size = big ? "h-14 w-12" : "h-10 w-10";
    return (
        <div className="flex items-center rounded-xl bg-tint">
            <button type="button" onClick={onLess} className={`press flex ${size} items-center justify-center`} aria-label="Less">
                {qty === 1 && !big ? <Trash2 className="h-4 w-4" /> : <Minus className={big ? "h-5 w-5" : "h-4 w-4"} />}
            </button>
            <span className={`money ${big ? "w-7 text-lg" : "w-6"} text-center font-bold`}>{qty}</span>
            <button type="button" onClick={onMore} className={`press flex ${size} items-center justify-center`} aria-label="More">
                <Plus className={big ? "h-5 w-5" : "h-4 w-4"} />
            </button>
        </div>
    );
}

// BOTTOM SHEET: slides up from the bottom, tap the dark area to close
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 backdrop-blur-[2px]" role="dialog" aria-modal="true" onClick={onClose}>
            <div
                className="no-scrollbar max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" />
                {children}
            </div>
        </div>
    );
}

// ITEM SHEET: required groups start on their first choice; optional ones can be left empty
function ItemSheet({ item, groups, onAdd, onClose }: { item: Item; groups: Group[]; onAdd: (chosen: Option[], qty: number, note: string) => void; onClose: () => void }) {
    const [selected, setSelected] = useState<Record<string, string>>(() =>
        Object.fromEntries(groups.filter((g) => g.required && g.options[0]).map((g) => [g.id, g.options[0].id])),
    );
    const [qty, setQty] = useState(1);
    const [lineNote, setLineNote] = useState("");

    const chosen = groups.flatMap((g) => g.options.filter((o) => selected[g.id] === o.id));
    const unitSen = toSen(item.price) + chosen.reduce((s, o) => s + toSen(o.price), 0);
    const missing = groups.some((g) => g.required && !selected[g.id]);

    function pick(g: Group, o: Option) {
        setSelected((s) => {
            // tapping the picked choice of an OPTIONAL group un-picks it
            if (!g.required && s[g.id] === o.id) {
                const next = { ...s };
                delete next[g.id];
                return next;
            }
            return { ...s, [g.id]: o.id };
        });
    }

    return (
        <Sheet onClose={onClose}>
            <div className="aspect-[16/9] overflow-hidden rounded-2xl">
                <ItemImage item={item} />
            </div>
            <div className="mt-3 flex items-start gap-3">
                <div className="flex-1">
                    <h2 className="text-xl font-bold">{item.name}</h2>
                    {item.description && <p className="text-sm text-ink-2">{item.description}</p>}
                </div>
                <p className="money text-lg font-bold text-primary">{formatRM(toSen(item.price))}</p>
            </div>

            {groups.map((g) => (
                <fieldset key={g.id} className="mt-4">
                    <legend className="mb-2 text-sm font-semibold">
                        {g.name} <span className="font-normal text-ink-3">{g.required ? "· pick one" : "· optional"}</span>
                    </legend>
                    <div className="grid grid-cols-3 gap-2">
                        {g.options.map((o) => (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => pick(g, o)}
                                className={`press min-h-12 rounded-xl border-2 px-2 py-1.5 text-sm font-semibold ${
                                    selected[g.id] === o.id ? "border-primary-soft bg-tint text-primary" : "border-line"
                                }`}
                            >
                                {o.name}
                                {toSen(o.price) > 0 && <span className="money block text-xs text-primary">+{formatRM(toSen(o.price))}</span>}
                            </button>
                        ))}
                    </div>
                </fieldset>
            ))}

            <label className="mt-4 block text-sm font-semibold">
                Request <span className="font-normal text-ink-3">(optional)</span>
                <input value={lineNote} onChange={(e) => setLineNote(e.target.value)} maxLength={60} placeholder="e.g. less ice" className={INPUT} />
            </label>

            <div className="mt-5 flex items-center gap-3">
                <Stepper big qty={qty} onLess={() => setQty((q) => Math.max(1, q - 1))} onMore={() => setQty((q) => Math.min(20, q + 1))} />
                <button type="button" disabled={missing} onClick={() => onAdd(chosen, qty, lineNote.trim())} className="btn-primary h-14 flex-1">
                    Add · <span className="money">{formatRM(unitSen * qty)}</span>
                </button>
            </div>
        </Sheet>
    );
}
