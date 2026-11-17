"use client"; // the cart lives on the customer's phone until they press "Send order"

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { OptionPicker } from "@/app/(pos)/option-picker";
import type { CartLine, Group, Item, Option } from "@/app/(pos)/order-screen";
import { formatRM, toSen } from "@/lib/money";
import { placeQrOrder } from "../actions";

type Props = {
    code: string;
    shopName: string;
    tagline: string | null;
    tableLabel: string | null; // null = counter QR (takeaway only)
    sstRate: number;
    categories: { id: string; name: string }[];
    items: Item[];
    groups: Group[];
};

// saved cart for THIS QR code (so a refresh on the phone doesn't lose it)
function loadCart(key: string): CartLine[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((l) => l.key && Array.isArray(l.optionIds)) : [];
    } catch {
        return [];
    }
}

// The customer's phone: menu → cart → Send order. Prices here are only for show;
// the server works out the real ones.
export function CustomerMenu({ code, shopName, tagline, tableLabel, sstRate, categories, items, groups }: Props) {
    const router = useRouter();
    const cartKey = `qr.cart.${code}`;
    const [cart, setCart] = useState<CartLine[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [activeCat, setActiveCat] = useState(categories[0]?.id ?? "all");
    const [search, setSearch] = useState(""); // text in the search box
    const [picking, setPicking] = useState<Item | null>(null);
    const [showCart, setShowCart] = useState(false);
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

    // typing searches the whole menu (ignores the chips); empty box = the selected category
    const query = search.trim().toLowerCase();
    const shown = query
        ? items.filter((i) => i.name.toLowerCase().includes(query))
        : activeCat === "all"
          ? items
          : items.filter((i) => i.category_id === activeCat);
    const groupsFor = (item: Item) => groups.filter((g) => item.menu_item_option_groups.some((l) => l.group_id === g.id));

    function tapItem(item: Item) {
        if (!item.is_available) return;
        if (groupsFor(item).length > 0) setPicking(item);
        else addItem(item, []);
    }

    function addItem(item: Item, chosen: Option[]) {
        const key = `${item.id}|${chosen.map((o) => o.id).join(",")}`;
        const unitSen = toSen(item.price) + chosen.reduce((sum, o) => sum + toSen(o.price), 0);
        setCart((lines) =>
            lines.some((l) => l.key === key)
                ? lines.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l))
                : [...lines, { key, itemId: item.id, name: item.name, options: chosen.map((o) => o.name), optionIds: chosen.map((o) => o.id), unitSen, qty: 1 }],
        );
    }

    function changeQty(key: string, by: number) {
        setCart((lines) => lines.map((l) => (l.key === key ? { ...l, qty: l.qty + by } : l)).filter((l) => l.qty > 0));
    }

    async function send() {
        setSending(true);
        setError("");
        const result = await placeQrOrder({
            code,
            type,
            name,
            note,
            lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty, optionIds: l.optionIds, note: l.note ?? "" })),
        });
        if (!result.ok) {
            setSending(false);
            setError(result.message);
            return;
        }
        setCart([]);
        localStorage.setItem(cartKey, "[]");
        router.push(`/order/track/${result.id}`); // the "waiting for staff" page
    }

    const count = cart.reduce((n, l) => n + l.qty, 0);
    const subtotal = cart.reduce((s, l) => s + l.unitSen * l.qty, 0);
    const sst = Math.round((subtotal * sstRate) / 100);
    const needsName = type === "takeaway" && name.trim() === "";

    return (
        <div className="flex min-h-dvh flex-col">
            {/* HEADER: shop + where you are */}
            <header className="border-b border-line bg-surface px-5 pb-3 pt-5">
                <h1 className="text-2xl font-bold">{shopName}</h1>
                {tagline && <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">{tagline}</p>}
                <p className="mt-2 inline-block rounded-full bg-tint px-3 py-1 text-sm font-semibold text-primary">
                    {tableLabel ? `Table ${tableLabel}` : "Takeaway order"}
                </p>
            </header>

            {/* SEARCH + CATEGORY CHIPS: stay at the top while the menu scrolls */}
            <div className="sticky top-0 z-10 bg-canvas px-5 pt-3">
                <div className="relative">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search menu…"
                        className="h-11 w-full rounded-full border border-line bg-surface px-4 pr-10 text-base outline-none focus:ring-2 focus:ring-primary"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-xl text-ink-2">
                            ×
                        </button>
                    )}
                </div>
            </div>
            <div className="sticky top-14 z-10 flex gap-2 overflow-x-auto bg-canvas px-5 py-3">
                {[...categories, { id: "all", name: "All" }].map((c) => (
                    <button
                        key={c.id}
                        onClick={() => setActiveCat(c.id)}
                        className={`h-10 shrink-0 rounded-full px-4 font-semibold ${c.id === activeCat ? "bg-primary text-white" : "border border-line bg-surface"}`}
                    >
                        {c.name}
                    </button>
                ))}
            </div>

            {/* MENU LIST: one row per item, big tap area for thumbs */}
            <div className="flex flex-1 flex-col gap-2 px-5 pb-28">
                {shown.length === 0 && <p className="py-10 text-center text-ink-2">{query ? `No items match “${search.trim()}”` : "Nothing here yet"}</p>}
                {shown.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => tapItem(item)}
                        disabled={!item.is_available}
                        className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left disabled:opacity-50"
                    >
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-tint text-xl font-bold text-primary/50">
                            {item.name.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{item.name}</span>
                            <span className="block text-sm font-bold text-primary">
                                {item.is_available ? formatRM(toSen(item.price)) : "Sold out"}
                            </span>
                            {item.menu_item_option_groups.length > 0 && <span className="block text-xs text-ink-2">+ choices</span>}
                        </span>
                        {item.is_available && <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xl font-bold text-white">+</span>}
                    </button>
                ))}
            </div>

            {/* BOTTOM BAR: open the cart */}
            {count > 0 && !showCart && (
                <div className="fixed inset-x-0 bottom-0 mx-auto max-w-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <button onClick={() => setShowCart(true)} className="flex h-14 w-full items-center justify-between rounded-2xl bg-primary px-5 font-bold text-white shadow-lg">
                        <span>View cart ({count})</span>
                        <span>{formatRM(subtotal)}</span>
                    </button>
                </div>
            )}

            {/* CART (full screen on the phone) */}
            {showCart && (
                <div className="fixed inset-0 z-30 mx-auto flex max-w-xl flex-col bg-surface">
                    <div className="flex items-center justify-between border-b border-line px-5 py-4">
                        <h2 className="text-xl font-bold">Your order</h2>
                        <button onClick={() => setShowCart(false)} className="font-semibold text-primary">
                            ← Menu
                        </button>
                    </div>

                    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                        {cart.length === 0 && <p className="py-10 text-center text-ink-2">Your cart is empty</p>}
                        {cart.map((l) => (
                            <div key={l.key} className="rounded-2xl border border-line p-3">
                                <div className="flex justify-between gap-2">
                                    <span className="font-semibold">{l.name}</span>
                                    <span className="font-bold">{formatRM(l.unitSen * l.qty)}</span>
                                </div>
                                {l.options.length > 0 && <p className="text-sm text-ink-2">{l.options.join(", ")}</p>}
                                <div className="mt-2 flex items-center gap-3">
                                    <button onClick={() => changeQty(l.key, -1)} className="h-10 w-10 rounded-xl bg-tint text-lg font-bold">
                                        −
                                    </button>
                                    <span className="w-6 text-center font-bold">{l.qty}</span>
                                    <button onClick={() => changeQty(l.key, +1)} className="h-10 w-10 rounded-xl bg-tint text-lg font-bold">
                                        +
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* DINE-IN / TAKEAWAY: a counter QR is takeaway only */}
                        {cart.length > 0 && (
                            <>
                                {tableLabel && (
                                    <div className="grid grid-cols-2 gap-2">
                                        {(["dine_in", "takeaway"] as const).map((t) => (
                                            <button
                                                key={t}
                                                onClick={() => setType(t)}
                                                className={`h-12 rounded-xl font-semibold ${type === t ? "bg-primary text-white" : "border border-line"}`}
                                            >
                                                {t === "dine_in" ? `Dine-in · Table ${tableLabel}` : "Takeaway"}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {type === "takeaway" && (
                                    <label className="flex flex-col text-sm font-semibold text-ink-2">
                                        Your name (we&apos;ll call you)
                                        <input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            maxLength={30}
                                            placeholder="e.g. Aina"
                                            className="mt-1 h-12 rounded-xl bg-tint px-4 text-base font-semibold text-ink outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </label>
                                )}
                                <label className="flex flex-col text-sm font-semibold text-ink-2">
                                    Note for the kitchen (optional)
                                    <input
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        maxLength={200}
                                        placeholder="e.g. less spicy, no ice"
                                        className="mt-1 h-12 rounded-xl bg-tint px-4 text-base text-ink outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </label>
                            </>
                        )}
                    </div>

                    {/* TOTAL + SEND */}
                    <div className="border-t border-line p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                        <div className="flex justify-between text-ink-2">
                            <span>Subtotal</span>
                            <span>{formatRM(subtotal)}</span>
                        </div>
                        {sstRate > 0 && (
                            <div className="flex justify-between text-ink-2">
                                <span>SST ({sstRate}%)</span>
                                <span>{formatRM(sst)}</span>
                            </div>
                        )}
                        <div className="mt-1 flex justify-between text-xl font-bold">
                            <span>Total</span>
                            <span className="text-primary">{formatRM(subtotal + sst)}</span>
                        </div>
                        <p className="mt-1 text-xs text-ink-2">Pay at the counter. Cash is rounded to the nearest 5 sen.</p>
                        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
                        <button
                            onClick={send}
                            disabled={cart.length === 0 || needsName || sending}
                            className="mt-4 h-14 w-full rounded-2xl bg-primary text-lg font-bold text-white disabled:opacity-40"
                        >
                            {sending ? "Sending…" : needsName ? "Type your name first" : "Send order"}
                        </button>
                    </div>
                </div>
            )}

            {picking && (
                <OptionPicker
                    item={picking}
                    groups={groupsFor(picking)}
                    onAdd={(chosen) => {
                        addItem(picking, chosen);
                        setPicking(null);
                    }}
                    onClose={() => setPicking(null)}
                />
            )}
        </div>
    );
}
