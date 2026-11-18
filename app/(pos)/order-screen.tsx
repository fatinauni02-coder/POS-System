"use client"; // needs the browser: useState, clicks, localStorage

import { useState, useEffect } from "react";
import { OptionPicker } from "./option-picker";
import { formatRM, toSen } from "@/lib/money";
import { CheckoutPanel, type Method } from "./checkout-panel";
import { payBill, placeOrder, sendRound } from "./actions";
import { collectQr } from "./qr/actions";
import Link from "next/link";
import { DiscountPanel } from "./discount-panel";
import { VoidLineButton } from "./void-line-button";
import { useRouter } from "next/navigation";
import { Spinner, SubmitButton } from "@/components/submit-button";

// ---------- TYPES: the shape of the data this screen gets from page.tsx ----------
// (if you add a column to a Supabase select in page.tsx, add it here too)
type Category = { id: string; name: string };
export type Item = {
    id: number; name: string; price: number | string; image_url?: string | null; category_id: string | null; is_available: boolean;
    menu_item_option_groups: { group_id: string }[]; // which option groups this item uses
    left: number | null;
};
export type Option = { id: string; name: string; price: number | string; sort_order: number }; // e.g. Iced +1.00
export type Group = { id: string; name: string; required: boolean; options: Option[] }; // e.g. Temperature
// one line in the cart. key = item id + chosen option ids, so "Latte Hot" and "Latte Iced" are 2 lines
export type CartLine = { key: string; itemId: number; name: string; options: string[]; optionIds: string[]; unitSen: number; qty: number; note?: string };

// RESTAURANT MODE: a line already sent to the kitchen (from page.tsx)
export type SentLine = { id: number; name: string; qty: number; lineSen: number; options: string[]; note: string | null; round: number; voided: boolean };
// the table we're ordering for, and its open bill (null = nothing sent yet)
export type TableInfo = {
    label: string;
    bill: { id: number; orderNo: number; subtotalSen: number; lines: SentLine[] } | null;
    title?: string; // shown instead of "Table 5" (e.g. "Takeaway · Ali")
    canAdd?: boolean; // false = pay only, no new rounds (takeaway QR bills)
    backHref?: string; // where "back" goes (default /tables)
    backLabel?: string;
    qrId?: string | null; // takeaway bill from a QR order → "Collected" after paying
};

type Props = { categories: Category[]; items: Item[]; groups: Group[]; sstRate: number; tables: string[]; tableInfo: TableInfo | null };
const CART_KEY = "pos.cart"; // the name the cart is saved under in the browser

// Reads the saved cart from the browser when the screen opens.
// Anything broken or from an old version → start with an empty cart instead of crashing.
// key: the counter uses "pos.cart"; each table has its own, e.g. "pos.cart.table.5"
function loadCart(key: string): CartLine[] {
    try {
        const saved = localStorage.getItem(key);
        const parsed = saved ? JSON.parse(saved) : [];
        return Array.isArray(parsed) ? parsed.filter((l) => l.key && Array.isArray(l.optionIds)) : [];
    } catch {
        return [];
    }
}

// a parked order: its cart + takeaway/dine-in + table, and a name to find it again
type Held = { id: string; label: string; lines: CartLine[]; orderType: "takeaway" | "dine_in"; table: string; note?: string };
const HELD_KEY = "pos.held";

function loadHeld(): Held[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(HELD_KEY) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((h) => h.id && Array.isArray(h.lines)) : [];
    } catch {
        return [];
    }
}

export function OrderScreen({ categories, items, groups, sstRate, tables, tableInfo }: Props) {
    // restaurant mode = ordering for a table (cart = next round, "Send to kitchen" instead of "Charge")
    const cartKey = tableInfo ? `${CART_KEY}.table.${tableInfo.label}` : CART_KEY;

    // ---------- STATE (values that change → screen redraws) ----------
    const [activeCat, setActiveCat] = useState(categories[0]?.id ?? "all"); // selected chip; starts on the 1st category
    const [search, setSearch] = useState(""); // text in the search box
    const [cart, setCart] = useState<CartLine[]>(() => loadCart(cartKey));
    const [picking, setPicking] = useState<Item | null>(null); // item whose pop-up is open
    const [paying, setPaying] = useState(false); // payment pop-up open?
    const [done, setDone] = useState<{ orderId: number; orderNo: number; change: number } | null>(null); // last paid order
    const [discount, setDiscount] = useState<{ pct: number; token: string } | null>(null); // discount applied to the cart
    const [askDiscount, setAskDiscount] = useState(false); // show the "enter manager PIN for discount" pop-up?
    const router = useRouter();
    const [orderType, setOrderType] = useState<"takeaway" | "dine_in">("takeaway");
    const [table, setTable] = useState("");
    const [showCart, setShowCart] = useState(false);
    const [noteFor, setNoteFor] = useState<string | null>(null);
    // KITCHEN NOTE for the whole order ("all less sugar", "in a rush") — printed on the tickets
    const [orderNote, setOrderNote] = useState("");
    const [editingNote, setEditingNote] = useState(false);
    const [held, setHeld] = useState<Held[]>(loadHeld);
    const [showHeld, setShowHeld] = useState(false);
    const needsTable = orderType === "dine_in" && table.trim() === "";
    const [sending, setSending] = useState(false); // waiting for the server after "Send to kitchen"
    const [sendError, setSendError] = useState("");

    // every time the cart changes, save it in the browser (so F5 doesn't lose it)
    useEffect(() => {
        localStorage.setItem(cartKey, JSON.stringify(cart));
    }, [cart, cartKey]);

    useEffect(() => {
        localStorage.setItem(HELD_KEY, JSON.stringify(held));
    }, [held]);

    // items for the selected chip ("all" = every item)
    // typing searches ALL items (ignores the chips); empty box = the selected category as before
    const query = search.trim().toLowerCase();
    const shown = query
        ? items.filter((i) => i.name.toLowerCase().includes(query))
        : activeCat === "all"
          ? items
          : items.filter((i) => i.category_id === activeCat);

    // the option groups this item uses (e.g. Latte → Temperature, Milk)
    function groupsFor(item: Item) {
        const ids = item.menu_item_option_groups.map((link) => link.group_id);
        return groups.filter((g) => ids.includes(g.id));
    }

    // ---------- stock limits ----------
    // how many of this item are already in the cart (all lines, any options)
    function inCart(itemId: number) {
        return cart.filter((l) => l.itemId === itemId).reduce((n, l) => n + l.qty, 0);
    }
    // how many more can still be added (null = no limit)
    function remaining(item: Item) {
        return item.left === null ? null : item.left - inCart(item.id);
    }
    function isMaxed(item: Item) {
        const r = remaining(item);
        return r !== null && r <= 0;
    }
    // small amber text on the tile, or null for nothing
    function stockNote(item: Item) {
        const r = remaining(item);
        if (!item.is_available || item.left === 0 || r === null || r > 5) return null;
        return r > 0 ? `Only ${r} left` : "No more in stock";
    }

    // tap a tile: items with options open the pop-up, others go straight in
    function tapItem(item: Item) {
        if (tableInfo?.canAdd === false) return; // takeaway QR bill: pay only
        if (isMaxed(item)) return;
        if (groupsFor(item).length > 0) setPicking(item);
        else addItem(item, []);
    }

    // same item + same options → +1 on that line; otherwise a new line
    function addItem(item: Item, chosen: Option[]) {
        if (isMaxed(item)) return;
        const key = `${item.id}|${chosen.map((o) => o.id).join(",")}`;
        const unitSen = toSen(item.price) + chosen.reduce((sum, o) => sum + toSen(o.price), 0);
        setCart((lines) => {
            const existing = lines.find((l) => l.key === key);
            if (existing) {
                return lines.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
            }
            const options = chosen.map((o) => o.name);
            const optionIds = chosen.map((o) => o.id);
            return [...lines, { key, itemId: item.id, name: item.name, options, optionIds, unitSen, qty: 1 }];
        });
    }

    // + / − buttons; a line that reaches 0 is removed
    function changeQty(key: string, by: number) {
        const line = cart.find((l) => l.key === key);
        const item = items.find((i) => i.id === line?.itemId);
        if (by > 0 && item && isMaxed(item)) return;
        setCart((lines) =>
            lines.map((l) => (l.key === key ? { ...l, qty: l.qty + by } : l)).filter((l) => l.qty > 0),
        );
    }

    // type in a line's note box → save it on that line
    function changeNote(key: string, note: string) {
        setCart((lines) => lines.map((l) => (l.key === key ? { ...l, note } : l)));
    }

    // park the current cart and start fresh (a discount is NOT kept: it needs the PIN again)
    function holdOrder() {
        if (cart.length === 0) return;
        const time = new Date().toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
        const label = orderType === "dine_in" && table.trim() ? `Table ${table.trim()}` : `Takeaway · ${time}`;
        setHeld((list) => [...list, { id: String(Date.now()), label, lines: cart, orderType, table, note: orderNote }]);
        setCart([]);
        setOrderNote("");
        setDiscount(null);
        setTable("");
        setOrderType("takeaway");
    }

    // bring a parked order back (only when the cart is empty, so nothing gets lost)
    function resumeOrder(h: Held) {
        if (cart.length > 0) return;
        setCart(h.lines);
        setOrderType(h.orderType);
        setTable(h.table);
        setOrderNote(h.note ?? "");
        setHeld((list) => list.filter((x) => x.id !== h.id));
        setShowHeld(false);
    }

    function deleteHeld(id: string) {
        setHeld((list) => list.filter((x) => x.id !== id));
    }

    // send the cart to the server; returns an error message, or null if saved
    async function pay(method: Method, tendered: number, payable: number) {
        const result = await placeOrder({
            lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty, optionIds: l.optionIds, note: l.note ?? "" })),
            method,
            tendered,
            expectedPayable: payable,
            discountPct: discount?.pct ?? 0,
            discountToken: discount?.token ?? null,
            orderType,
            table: orderType === "dine_in" ? table : null,
            note: orderNote,
        });
        if (!result.ok) return result.message;

        setCart([]); // saved → empty the cart for the next customer
        setDiscount(null); // discount only applies to one order
        setOrderNote("");
        setTable("");
        setPaying(false);
        setShowCart(false);
        setDone({ orderId: result.orderId, orderNo: result.orderNo, change: result.change });
        router.refresh();
        return null;
    }

    // RESTAURANT MODE: send the cart to the kitchen as the next round, then show its tickets
    async function sendToKitchen() {
        if (!tableInfo || cart.length === 0) return;
        setSending(true);
        setSendError("");
        const result = await sendRound({
            table: tableInfo.label,
            lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty, optionIds: l.optionIds, note: l.note ?? "" })),
            note: orderNote,
        });
        setSending(false);
        if (!result.ok) {
            setSendError(result.message);
            return;
        }
        setCart([]); // sent → this table's cart is empty again
        setOrderNote("");
        router.push(`/receipt/${result.orderId}?round=${result.round}`); // the Drinks / Kitchen tickets for this round
    }

    // RESTAURANT MODE: pay the whole table bill (all rounds) — called by the payment pop-up
    async function payTableBill(method: Method, tendered: number, payable: number) {
        if (!tableInfo?.bill) return "Nothing to pay on this table.";
        const result = await payBill({
            orderId: tableInfo.bill.id,
            method,
            tendered,
            expectedPayable: payable,
            discountPct: discount?.pct ?? 0,
            discountToken: discount?.token ?? null,
        });
        if (!result.ok) return result.message;

        setDiscount(null);
        setPaying(false);
        setShowCart(false);
        setDone({ orderId: result.orderId, orderNo: result.orderNo, change: result.change });
        router.refresh(); // the table is free now → the screen reloads without the bill
        return null;
    }

    // already-sent lines grouped by round: [[1, lines], [2, lines]…]
    const rounds = new Map<number, SentLine[]>();
    for (const l of tableInfo?.bill?.lines ?? []) rounds.set(l.round, [...(rounds.get(l.round) ?? []), l]);

    // ---------- TOTALS (all in sen: RM 12.50 = 1250) ----------
    const count = cart.reduce((n, l) => n + l.qty, 0);
    const subtotal = cart.reduce((sum, l) => sum + l.unitSen * l.qty, 0);
    const discountSen = discount ? Math.round((subtotal * discount.pct) / 100) : 0;
    const sst = Math.round(((subtotal - discountSen) * sstRate) / 100); // 6% = 0.06, but we store it as 6, so divide by 100
    const total = subtotal - discountSen + sst;

    // RESTAURANT MODE: the table bill (everything sent, voided lines already left out by the server)
    const billSub = tableInfo?.bill?.subtotalSen ?? 0;
    const billDiscount = discount ? Math.round((billSub * discount.pct) / 100) : 0;
    const billSst = Math.round(((billSub - billDiscount) * sstRate) / 100);
    const billTotal = billSub - billDiscount + billSst;


    // SCREEN SHAPE:
    //   ┌─────────────────────────────────┬──────────────┐
    //   │ MENU (main)                     │ CART (aside) │
    //   │ [Coffee][Tea][All]  ← chips     │ title        │
    //   │ ┌────┐┌────┐┌────┐  ← item grid │ lines        │
    //   │ └────┘└────┘└────┘              │ (scrolls)    │
    //   │                                 │ totals       │
    //   │                                 │ Clear|Charge │
    //   └─────────────────────────────────┴──────────────┘
    return (
        // flex = menu and cart side by side; h-full = fill the page area under the top bar
        <div className="flex h-full">
            {/* ===== LEFT: MENU =====
                flex-1 = takes all the width the cart doesn't use
                min-w-0 = allowed to shrink (so the cart never gets pushed off screen)
                flex-col gap-4 = chips row on top, grid below, 4 apart
                p-5 = space around the edges */}
            <main className="flex min-w-0 flex-1 flex-col gap-4 p-3 lg:p-5">
                {/* SEARCH BOX: × clears it */}
                <div className="relative">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search menu…"
                        className="h-11 w-full rounded-2xl border border-line bg-surface px-4 pr-10 font-semibold outline-none focus:ring-2 focus:ring-primary"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-xl text-ink-2">
                            ×
                        </button>
                    )}
                </div>

                {/* CATEGORY CHIPS: one row, gap-2 between chips
                    overflow-x-auto = too many chips → the row scrolls sideways (pb-1 = room for the scrollbar) */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {/* [...categories, All] = your categories + an extra "All" chip at the end */}
                    {[...categories, { id: "all", name: "All" }].map((c) => (
                        // ONE CHIP: h-11 = height; px-4 = side padding (width follows the text)
                        // shrink-0 = never squash the text; rounded-2xl = corners (rounded-full = pill)
                        // selected = orange with white text; others = white with a border
                        <button
                            key={c.id}
                            onClick={() => setActiveCat(c.id)}
                            className={`h-11 shrink-0 rounded-2xl px-4 font-semibold ${c.id === activeCat ? "bg-primary text-white" : "border border-line bg-surface"
                                }`}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>

                {/* ITEM GRID
                    grid-cols-[repeat(auto-fill,minmax(160px,1fr))] = as many columns as fit,
                      each at least 160px wide, sharing the leftover space equally.
                      → bigger tiles: change 160px to 200px; smaller: 130px
                      → a fixed number of columns instead: grid-cols-4
                    gap-3 = space between tiles; overflow-y-auto = the grid scrolls; pb-6 = space at the bottom */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 overflow-y-auto pb-6">
                    {shown.map((item) => (
                        // ONE TILE (a button): picture / name / price / "+ options"
                        // flex-col = stacked; p-3 = inner space; text-left = text aligned left
                        // hover:border-primary = orange border on mouse-over
                        // disabled:opacity-50 = sold-out tiles faded and not clickable
                        <button
                            key={item.id}
                            onClick={() => tapItem(item)}
                            disabled={!item.is_available || isMaxed(item)}
                            className="flex flex-col rounded-2xl border border-line bg-surface p-3 text-left hover:border-primary disabled:opacity-50"
                        >
                            {/* PICTURE placeholder: aspect-square = always square (aspect-[4/3] = 4 wide : 3 tall)
                                text-3xl = letter size; text-primary/50 = orange at 50% */}
                            {item.image_url ? (
                                // the item's photo (Menu → Upload photo); lazy = loads when scrolled into view
                                // eslint-disable-next-line @next/next/no-img-element -- photo from Supabase Storage
                                <img src={item.image_url} alt="" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                            ) : (
                                <span className="flex aspect-square items-center justify-center rounded-xl bg-tint text-3xl font-bold text-primary/50">
                                    {item.name.charAt(0)}
                                </span>
                            )}
                            {/* NAME: mt-2 = gap above */}
                            <span className="mt-2 font-semibold">{item.name}</span>
                            {/* PRICE (or "Sold out") */}
                            <span className="mt-1 font-bold text-primary">
                                {!item.is_available ? "Sold out" : item.left === 0 ? "Out of stock" : formatRM(toSen(item.price))}
                            </span>
                            {/* low-stock warning: 5 or fewer left (after what's already in the cart) */}
                            {stockNote(item) &&
                                <span className="text-xs font-bold text-amber-700">{stockNote(item)}</span>}
                            {/* "+ options" hint, only for items that have option groups */}
                            {item.menu_item_option_groups.length > 0 && (
                                <span className="text-xs text-ink-2">+ options</span>
                            )}
                        </button>
                    ))}
                    {shown.length === 0 && <p className="col-span-full py-10 text-center text-ink-2">{query ? `No items match “${search.trim()}”` : "No items in this category"}</p>}
                </div>
                {count > 0 && (
                    <button
                        onClick={() => setShowCart(true)}
                        className="flex h-14 shrink-0 items-center justify-between rounded-2xl bg-primary px-5 font-bold text-white md:hidden"
                    >
                        <span>{tableInfo ? `Table ${tableInfo.label}` : "View order"} ({count})</span>
                        <span>{formatRM(tableInfo ? subtotal : total)}</span>
                    </button>
                )}
            </main>

            {/* ===== RIGHT: CART =====
                w-[340px] = cart width → change it here
                shrink-0 = keep that width even on small screens
                flex-col = title / lines / totals stacked; border-l = line on its left */}
            <aside
                className={`${showCart ? "fixed inset-0 z-30 flex" : "hidden"} flex-col bg-surface md:static md:flex md:w-[290px] lg:w-[340px] md:shrink-0 md:border-l md:border-line`}
            >
                {/* TITLE: px-5 pt-5 = space at the sides and top; text-2xl = size */}
                <button onClick={() => setShowCart(false)} className="px-5 pt-4 text-left font-semibold text-primary md:hidden">
                    ← Back to menu
                </button>
                {tableInfo ? (
                    // RESTAURANT MODE TITLE: "Table 5" + back to the tables
                    <div className="flex items-baseline justify-between px-5 pt-5">
                        <h1 className="text-2xl font-bold">
                            {tableInfo.title ?? `Table ${tableInfo.label}`}
                            {tableInfo.bill && <span className="ml-2 text-base font-semibold text-ink-2">#{tableInfo.bill.orderNo}</span>}
                        </h1>
                        <Link href={tableInfo.backHref ?? "/tables"} className="text-sm font-semibold text-primary">
                            ← {tableInfo.backLabel ?? "Tables"}
                        </Link>
                    </div>
                ) : (
                    <h1 className="px-5 pt-5 text-2xl font-bold">
                        Current order <span className="text-base font-semibold text-ink-2">({count} items)</span>
                    </h1>
                )}

                {!tableInfo && held.length > 0 && (
                    <button onClick={() => setShowHeld(true)} className="mx-5 mt-2 h-10 rounded-xl border border-amber-300 bg-amber-50 font-semibold text-amber-800">
                        Held orders ({held.length})
                    </button>
                )}


                {/* TAKEAWAY / DINE-IN: two buttons side by side (grid-cols-2) — not for a table (always dine-in) */}
                <div className={`mt-3 grid-cols-2 gap-2 px-5 ${tableInfo ? "hidden" : "grid"}`}>
                    {(["takeaway", "dine_in"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setOrderType(t)}
                            className={`h-10 rounded-xl font-semibold ${orderType === t ? "bg-primary text-white" : "border border-line"}`}
                        >
                            {t === "takeaway" ? "Takeaway" : "Dine-in"}
                        </button>
                    ))}
                </div>
                {/* table box only for dine-in; <datalist> = suggestions from the shop's tables, but any text works */}
                {!tableInfo && orderType === "dine_in" && (
                    <div className="mt-2 px-5">
                        <input
                            value={table}
                            onChange={(e) => setTable(e.target.value)}
                            list="table-list"
                            maxLength={20}
                            placeholder="Table no. (e.g. 5)"
                            aria-label="Table number"
                            className={`h-10 w-full rounded-xl bg-tint px-3 font-semibold outline-none focus:ring-2 focus:ring-primary ${needsTable ? "ring-2 ring-amber-400" : ""}`}
                        />
                        <datalist id="table-list">
                            {tables.map((t) => (
                                <option key={t} value={t} />
                            ))}
                        </datalist>
                    </div>
                )}

                {/* CART LINES
                    flex-1 = takes all the height between the title and the totals
                    overflow-y-auto = many lines → only this part scrolls, totals stay visible
                    gap-2 = space between lines; p-5 = inner space */}
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-5">
                    {/* RESTAURANT MODE: what this table already has, round by round (read-only) */}
                    {tableInfo?.bill && (
                        <div className="rounded-2xl bg-tint p-3">
                            <div className="flex justify-between text-sm font-bold">
                                <span>Already sent</span>
                                <span>{formatRM(tableInfo.bill.subtotalSen)}</span>
                            </div>
                            {[...rounds].map(([round, lines]) => (
                                <div key={round} className="mt-2">
                                    <p className="text-xs font-bold uppercase text-ink-2">{round === 1 ? "Round 1" : `Round ${round} · add-on`}</p>
                                    {lines.map((l) => (
                                        <div key={l.id} className={`flex justify-between gap-2 text-sm ${l.voided ? "text-ink-2 line-through" : ""}`}>
                                            <span>
                                                {l.qty} x {l.name}
                                                {l.options.length > 0 && <span className="text-ink-2"> · {l.options.join(", ")}</span>}
                                            </span>
                                            <span className="flex shrink-0 items-baseline">
                                                {formatRM(l.lineSen)}
                                                {/* cancel a sent item (manager PIN); already voided → crossed out, no button */}
                                                {!l.voided && <VoidLineButton lineId={l.id} label={`${l.qty} x ${l.name}`} />}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                    {tableInfo && cart.length > 0 && <p className="mt-1 text-xs font-bold uppercase text-ink-2">New round</p>}

                    {cart.length === 0 && (
                        <p className="py-10 text-center text-ink-2">{tableInfo ? "Tap items to add a round for this table" : "Tap an item to start"}</p>
                    )}

                    {cart.map((l) => (
                        // ONE LINE (a bordered card): name + price / options / − qty + @unit price
                        <div key={l.key} className="rounded-2xl border border-line p-3">
                            {/* name on the left, line total on the right (justify-between) */}
                            <div className="flex justify-between gap-2">
                                <span className="font-semibold">{l.name}</span>
                                <span className="font-bold">{formatRM(l.unitSen * l.qty)}</span>
                            </div>
                            {/* chosen options, e.g. "Iced, Oat milk" (text-sm = smaller) */}
                            {l.options.length > 0 && <p className="text-sm text-ink-2">{l.options.join(", ")}</p>}
                            {/* NOTE: a text box while editing, otherwise the note in italics (tap it to edit) */}
                            {noteFor === l.key ? (
                                <input
                                    autoFocus
                                    value={l.note ?? ""}
                                    onChange={(e) => changeNote(l.key, e.target.value)}
                                    onBlur={() => setNoteFor(null)}
                                    onKeyDown={(e) => e.key === "Enter" && setNoteFor(null)}
                                    maxLength={60}
                                    placeholder="e.g. less sugar, no ice"
                                    className="mt-2 h-9 w-full rounded-lg bg-tint px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                />
                            ) : (
                                l.note && (
                                    <button onClick={() => setNoteFor(l.key)} className="mt-1 block text-left text-sm italic text-amber-800">
                                        “{l.note}”
                                    </button>
                                )
                            )}
                            {/* QTY ROW: mt-2 = gap above; items-center = all centred vertically */}
                            <div className="mt-2 flex items-center gap-2">
                                {/* − / + buttons: h-9 w-9 = square size (make bigger for fingers: h-11 w-11) */}
                                <button onClick={() => changeQty(l.key, -1)} className="h-9 w-9 rounded-lg bg-tint font-bold">
                                    -
                                </button>
                                {/* qty number: w-6 = fixed width so the buttons don't jump when 9 → 10 */}
                                <span className="w-6 text-center font-bold">{l.qty}</span>
                                <button
                                    onClick={() => changeQty(l.key, +1)}
                                    disabled={items.some((i) => i.id === l.itemId && isMaxed(i))}
                                    className="h-9 w-9 rounded-lg bg-tint font-bold disabled:opacity-40"
                                >
                                    +
                                </button>
                                {!l.note && noteFor !== l.key && (
                                    <button onClick={() => setNoteFor(l.key)} className="ml-2 text-sm font-semibold text-primary">
                                        + Note
                                    </button>
                                )}
                                {/* unit price, pushed to the right with ml-auto */}
                                <span className="ml-auto text-sm text-ink-2">@ {formatRM(l.unitSen)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* KITCHEN NOTE for the whole order: a link, then a box; Enter or tapping away closes it */}
                {cart.length > 0 && (
                    <div className="border-t border-line px-5 py-3">
                        {editingNote ? (
                            <input
                                autoFocus
                                value={orderNote}
                                onChange={(e) => setOrderNote(e.target.value)}
                                onBlur={() => setEditingNote(false)}
                                onKeyDown={(e) => e.key === "Enter" && setEditingNote(false)}
                                maxLength={200}
                                placeholder="e.g. all less sugar · in a rush"
                                aria-label="Kitchen note for the whole order"
                                className="h-11 w-full rounded-xl bg-tint px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary-soft"
                            />
                        ) : orderNote ? (
                            <button onClick={() => setEditingNote(true)} className="w-full rounded-xl bg-tint-2 px-3 py-2 text-left text-sm">
                                <span className="label-caps text-primary">Kitchen note</span>
                                <span className="block font-semibold italic">{orderNote}</span>
                            </button>
                        ) : (
                            <button onClick={() => setEditingNote(true)} className="text-sm font-semibold text-primary">
                                + Kitchen note for the whole order
                            </button>
                        )}
                    </div>
                )}

                {/* RESTAURANT MODE BOTTOM:
                    items in the cart → New round + Clear | Send to kitchen
                    cart empty + a bill → the bill (discount, SST, total) + Pay bill
                    (a new round has to be sent or cleared before paying, so nothing gets forgotten) */}
                {tableInfo ? (
                    <div className="border-t border-line p-5">
                        {(cart.length > 0 && tableInfo.canAdd !== false) || !tableInfo.bill ? (
                            <>
                                <div className="flex justify-between text-ink-2">
                                    <span>New round</span>
                                    <span>{formatRM(subtotal)}</span>
                                </div>
                                {sendError && <p className="mt-2 rounded-xl bg-red-50 p-2 text-sm font-semibold text-red-700">{sendError}</p>}
                                <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
                                    <button onClick={() => { setCart([]); setOrderNote(""); }} disabled={cart.length === 0 || sending} className="h-14 rounded-2xl bg-tint font-semibold disabled:opacity-40">
                                        Clear
                                    </button>
                                    <button onClick={sendToKitchen} disabled={cart.length === 0 || sending} className="h-14 rounded-2xl bg-primary font-bold text-white disabled:opacity-40">
                                        {sending ? <><Spinner className="mr-1.5 h-4 w-4" />Sending…</> : `Send to kitchen (${count})`}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex justify-between text-ink-2">
                                    <span>Bill subtotal</span>
                                    <span>{formatRM(billSub)}</span>
                                </div>
                                {discount ? (
                                    <div className="flex items-center justify-between text-green-700">
                                        <span>
                                            Discount {discount.pct}%{" "}
                                            <button onClick={() => setDiscount(null)} className="ml-1 text-sm text-red-700 underline">
                                                remove
                                            </button>
                                        </span>
                                        <span>−{formatRM(billDiscount)}</span>
                                    </div>
                                ) : (
                                    <button onClick={() => setAskDiscount(true)} className="text-sm font-semibold text-primary underline">
                                        + Add discount
                                    </button>
                                )}
                                {sstRate > 0 && (
                                    <div className="flex justify-between text-ink-2">
                                        <span>SST ({sstRate}%)</span>
                                        <span>{formatRM(billSst)}</span>
                                    </div>
                                )}
                                <div className="mt-2 flex justify-between text-xl font-bold">
                                    <span>Total</span>
                                    <span className="text-primary">{formatRM(billTotal)}</span>
                                </div>
                                <button onClick={() => setPaying(true)} className="mt-4 h-14 w-full rounded-2xl bg-primary font-bold text-white">
                                    Pay bill {formatRM(billTotal)}
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                // TOTALS + BUTTONS (always at the bottom; border-t = line above)
                <div className="border-t border-line p-5">
                    {/* each row: label left, amount right (justify-between) */}
                    <div className="flex justify-between text-ink-2">
                        <span>Subtotal</span>
                        <span>{formatRM(subtotal)}</span>
                    </div>

                    {/* DISCOUNT: a link to add one, or the discount with a remove button */}
                    {discount ? (
                        <div className="flex items-center justify-between text-green-700">
                            <span>
                                Discount {discount.pct}%{" "}
                                <button onClick={() => setDiscount(null)} className="ml-1 text-sm text-red-700 underline">
                                    remove
                                </button>
                            </span>
                            <span>−{formatRM(discountSen)}</span>
                        </div>
                    ) : (
                        <button onClick={() => setAskDiscount(true)} disabled={cart.length === 0} className="text-sm font-semibold text-primary underline disabled:opacity-40">
                            + Add discount
                        </button>
                    )}

                    {/* SST row only if the shop is SST-registered */}
                    {sstRate > 0 && (
                        <div className="flex justify-between text-ink-2">
                            <span>SST ({sstRate}%)</span>
                            <span>{formatRM(sst)}</span>
                        </div>
                    )}
                    {/* TOTAL: text-xl = bigger; mt-2 = gap above */}
                    <div className="mt-2 flex justify-between text-xl font-bold">
                        <span>Total</span>
                        <span className="text-primary">{formatRM(total)}</span>
                    </div>

                    {/* BUTTONS: grid-cols-[1fr_2fr] = Clear takes 1 part, Charge 2 parts (Charge is twice as wide)
                        → same width: grid-cols-2. h-14 = button height */}
                    <div className="mt-4 grid grid-cols-[1fr_1fr_2fr] gap-2">
                        <button onClick={() => { setCart([]); setDiscount(null); setOrderNote(""); }} disabled={cart.length === 0} className="h-14 rounded-2xl bg-tint font-semibold disabled:opacity-40">
                            Clear
                        </button>
                        <button onClick={holdOrder} disabled={cart.length === 0} className="h-14 rounded-2xl border border-line font-semibold disabled:opacity-40">
                            Hold
                        </button>
                        <button onClick={() => setPaying(true)} disabled={cart.length === 0 || needsTable} className="h-14 rounded-2xl bg-primary font-bold text-white disabled:opacity-40">
                            {needsTable ? "Enter table no." : `Charge ${formatRM(total)}`}
                        </button>
                    </div>
                </div>
                )}
            </aside>

            {/* the pop-up, only while an item is being picked (it covers the whole screen, see option-picker.tsx) */}
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
            {/* the payment pop-up, only after Charge is tapped */}
            {paying && (
                <CheckoutPanel
                    total={tableInfo ? billTotal : total}
                    onPay={tableInfo ? payTableBill : pay}
                    onClose={() => setPaying(false)}
                />
            )}

            {/* the discount pop-up */}
            {askDiscount && (
                <DiscountPanel
                    onApproved={(pct, token) => {
                        setDiscount({ pct, token });
                        setAskDiscount(false);
                    }}
                    onClose={() => setAskDiscount(false)}
                />
            )}

            {/* HELD ORDERS pop-up */}
            {showHeld && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowHeld(false)}>
                    <div className="w-full max-w-md rounded-3xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-xl font-bold">Held orders</h2>
                        {cart.length > 0 && (
                            <p className="mt-1 text-sm font-semibold text-amber-800">Hold or clear the current order before resuming one.</p>
                        )}
                        <div className="mt-4 flex flex-col gap-2">
                            {held.length === 0 && <p className="py-6 text-center text-ink-2">No held orders</p>}
                            {held.map((h) => {
                                const qty = h.lines.reduce((n, l) => n + l.qty, 0);
                                const sen = h.lines.reduce((s, l) => s + l.unitSen * l.qty, 0);
                                return (
                                    <div key={h.id} className="flex items-center gap-2 rounded-2xl border border-line p-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-semibold">{h.label}</p>
                                            <p className="text-sm text-ink-2">
                                                {qty} item{qty === 1 ? "" : "s"} · {formatRM(sen)}
                                            </p>
                                        </div>
                                        <button onClick={() => deleteHeld(h.id)} className="h-10 rounded-xl px-3 text-sm font-semibold text-red-700 hover:bg-red-50">
                                            Delete
                                        </button>
                                        <button onClick={() => resumeOrder(h)} disabled={cart.length > 0} className="h-10 rounded-xl bg-primary px-4 font-bold text-white disabled:opacity-40">
                                            Resume
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={() => setShowHeld(false)} className="mt-4 h-12 w-full rounded-2xl bg-tint font-semibold">
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* "Paid" pop-up after a successful save */}
            {done && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-sm rounded-3xl bg-surface p-6 text-center">
                        <p className="text-sm font-semibold text-green-700">Payment received</p>
                        <h2 className="mt-1 text-3xl font-bold">Order #{done.orderNo}</h2>
                        {done.change > 0 && (
                            <p className="mt-2 text-lg">
                                Change: <b>{formatRM(done.change)}</b>
                            </p>
                        )}
                        <div className="mt-6 grid grid-cols-2 gap-2">
                            <Link href={`/receipt/${done.orderId}`} className="flex h-14 items-center justify-center rounded-2xl bg-tint font-semibold">
                                Receipt
                            </Link>
                            {tableInfo ? (
                                // restaurant mode: the table is free again → back to the tables
                                <Link href={tableInfo.backHref ?? "/tables"} className="flex h-14 items-center justify-center rounded-2xl bg-primary font-bold text-white">
                                    Back to {tableInfo.backLabel ?? "Tables"}
                                </Link>
                            ) : (
                                <button onClick={() => setDone(null)} className="h-14 rounded-2xl bg-primary font-bold text-white">
                                    Next customer
                                </button>
                            )}
                            {/* QR takeaway: paid AND handed over in one go → marks the phone order Done, back to the board */}
                            {tableInfo?.qrId && (
                                <form action={collectQr} className="col-span-2">
                                    <input type="hidden" name="id" value={tableInfo.qrId} />
                                    <SubmitButton className="h-14 w-full rounded-2xl bg-green-700 font-bold text-white">Collected ✓</SubmitButton>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
