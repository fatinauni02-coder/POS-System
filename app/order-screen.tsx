"use client"; // needs the browser: useState, clicks, localStorage

import { useState, useEffect } from "react";
import { OptionPicker } from "./option-picker";
import { formatRM, toSen } from "@/lib/money";
import { CheckoutPanel, type Method } from "./checkout-panel";
import { placeOrder } from "./actions";
import Link from "next/link";
import { DiscountPanel } from "./discount-panel";
import { useRouter } from "next/navigation";

// ---------- TYPES: the shape of the data this screen gets from page.tsx ----------
// (if you add a column to a Supabase select in page.tsx, add it here too)
type Category = { id: string; name: string };
export type Item = {
    id: number; name: string; price: number | string; category_id: string | null; is_available: boolean;
    menu_item_option_groups: { group_id: string }[]; // which option groups this item uses
    left: number | null;
};
export type Option = { id: string; name: string; price: number | string; sort_order: number }; // e.g. Iced +1.00
export type Group = { id: string; name: string; required: boolean; options: Option[] }; // e.g. Temperature
// one line in the cart. key = item id + chosen option ids, so "Latte Hot" and "Latte Iced" are 2 lines
export type CartLine = { key: string; itemId: number; name: string; options: string[]; optionIds: string[]; unitSen: number; qty: number };

type Props = { categories: Category[]; items: Item[]; groups: Group[]; sstRate: number; tables: string[] };
const CART_KEY = "pos.cart"; // the name the cart is saved under in the browser

// Reads the saved cart from the browser when the screen opens.
// Anything broken or from an old version → start with an empty cart instead of crashing.
function loadCart(): CartLine[] {
    try {
        const saved = localStorage.getItem(CART_KEY);
        const parsed = saved ? JSON.parse(saved) : [];
        return Array.isArray(parsed) ? parsed.filter((l) => l.key && Array.isArray(l.optionIds)) : [];
    } catch {
        return [];
    }
}

export function OrderScreen({ categories, items, groups, sstRate, tables }: Props) {
    // ---------- STATE (values that change → screen redraws) ----------
    const [activeCat, setActiveCat] = useState(categories[0]?.id ?? "all"); // selected chip; starts on the 1st category
    const [cart, setCart] = useState<CartLine[]>(loadCart);
    const [picking, setPicking] = useState<Item | null>(null); // item whose pop-up is open
    const [paying, setPaying] = useState(false); // payment pop-up open?
    const [done, setDone] = useState<{ orderId: number; orderNo: number; change: number } | null>(null); // last paid order
    const [discount, setDiscount] = useState<{ pct: number; token: string } | null>(null); // discount applied to the cart
    const [askDiscount, setAskDiscount] = useState(false); // show the "enter manager PIN for discount" pop-up?
    const router = useRouter();
    const [orderType, setOrderType] = useState<"takeaway" | "dine_in">("takeaway");
    const [table, setTable] = useState("");
    const [showCart, setShowCart] = useState(false);
    const needsTable = orderType === "dine_in" && table.trim() === "";

    // every time the cart changes, save it in the browser (so F5 doesn't lose it)
    useEffect(() => {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }, [cart]);

    // items for the selected chip ("all" = every item)
    const shown = activeCat === "all" ? items : items.filter((i) => i.category_id === activeCat);

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

    // send the cart to the server; returns an error message, or null if saved
    async function pay(method: Method, tendered: number, payable: number) {
        const result = await placeOrder({
            lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty, optionIds: l.optionIds })),
            method,
            tendered,
            expectedPayable: payable,
            discountPct: discount?.pct ?? 0,
            discountToken: discount?.token ?? null,
            orderType,
            table: orderType === "dine_in" ? table : null,
        });
        if (!result.ok) return result.message;

        setCart([]); // saved → empty the cart for the next customer
        setDiscount(null); // discount only applies to one order
        setTable("");
        setPaying(false);
        setShowCart(false);
        setDone({ orderId: result.orderId, orderNo: result.orderNo, change: result.change });
        router.refresh();
        return null;
    }

    // ---------- TOTALS (all in sen: RM 12.50 = 1250) ----------
    const count = cart.reduce((n, l) => n + l.qty, 0);
    const subtotal = cart.reduce((sum, l) => sum + l.unitSen * l.qty, 0);
    const discountSen = discount ? Math.round((subtotal * discount.pct) / 100) : 0;
    const sst = Math.round(((subtotal - discountSen) * sstRate) / 100); // 6% = 0.06, but we store it as 6, so divide by 100
    const total = subtotal - discountSen + sst;


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
                            {/* PICTURE placeholder: aspect-[4/3] = always 4 wide : 3 tall (aspect-square = square)
                                text-3xl = letter size; text-primary/50 = orange at 50% */}
                            <span className="flex aspect-[4/3] items-center justify-center rounded-xl bg-tint text-3xl font-bold text-primary/50">
                                {item.name.charAt(0)}
                            </span>
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
                </div>
                {count > 0 && (
                    <button
                        onClick={() => setShowCart(true)}
                        className="flex h-14 shrink-0 items-center justify-between rounded-2xl bg-primary px-5 font-bold text-white md:hidden"
                    >
                        <span>View order ({count})</span>
                        <span>{formatRM(total)}</span>
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
                <h1 className="px-5 pt-5 text-2xl font-bold">
                    Current order <span className="text-base font-semibold text-ink-2">({count} items)</span>
                </h1>


                {/* TAKEAWAY / DINE-IN: two buttons side by side (grid-cols-2) */}
                <div className="mt-3 grid grid-cols-2 gap-2 px-5">
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
                {orderType === "dine_in" && (
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
                    {cart.length === 0 && <p className="py-10 text-center text-ink-2">Tap an item to start</p>}

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
                                {/* unit price, pushed to the right with ml-auto */}
                                <span className="ml-auto text-sm text-ink-2">@ {formatRM(l.unitSen)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* TOTALS + BUTTONS (always at the bottom; border-t = line above) */}
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
                    <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
                        <button onClick={() => { setCart([]); setDiscount(null); }} disabled={cart.length === 0} className="h-14 rounded-2xl bg-tint font-semibold disabled:opacity-40">
                            Clear
                        </button>
                        <button onClick={() => setPaying(true)} disabled={cart.length === 0 || needsTable} className="h-14 rounded-2xl bg-primary font-bold text-white disabled:opacity-40">
                            {needsTable ? "Enter table no." : `Charge ${formatRM(total)}`}
                        </button>
                    </div>
                </div>
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
                    total={total}
                    onPay={pay}
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
                            <button onClick={() => setDone(null)} className="h-14 rounded-2xl bg-primary font-bold text-white">
                                Next customer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
