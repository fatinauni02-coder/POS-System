"use server"; // everything in this file runs ONLY on the server (never in the browser)

import { getBusiness } from "@/lib/business";
import { isApproved, makeApproval } from "@/lib/approval";
import { DISCOUNTS } from "@/lib/money";
import { checkManagerPin } from "@/lib/pin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaff } from "@/lib/staff"

// What the browser sends: only WHAT was ordered — no prices.
// The database looks up the real prices itself, so nobody can change a price in DevTools.
export type OrderInput = {
    lines: { itemId: number; qty: number; optionIds: string[]; note: string }[];
    method: string; // "cash" | "card" | "duitnow" | "ewallet"
    tendered: number; // sen received (cash)
    expectedPayable: number; // sen the cashier saw; refused if the real total is different
    discountPct: number; // 0, 5, 10, 15, 20
    discountToken: string | null; // approval slip for this discount, or null if no discount
    orderType: "takeaway" | "dine_in";
    table: string | null;
};

// What comes back: either it worked (with the order number) or a message to show
export type OrderResult =
    | { ok: true; orderId: number; orderNo: number; change: number }
    | { ok: false; message: string };

// create_order raises short codes; turn them into words for the cashier
const MESSAGES: Record<string, string> = {
    EMPTY_ORDER: "The cart is empty.",
    ITEM_UNAVAILABLE: "An item is sold out or was removed. Take it out of the cart.",
    BAD_OPTION: "An option was changed on the Menu. Remove that item and add it again.",
    OPTION_REQUIRED: "An item is missing a required choice. Remove it and add it again.",
    BAD_METHOD: "This payment method is turned off for the shop.",
    NOT_ENOUGH_CASH: "Cash received is less than the amount to pay.",
    TOTAL_CHANGED: "Prices changed on the Menu. Refresh the page and check the total.",
    OUT_OF_STOCK: "Not enough stock for this order.",
};

export async function placeOrder(input: OrderInput): Promise<OrderResult> {
    const business = await getBusiness();
    if (!business) return { ok: false, message: "Shop not found" };
    const staff = await getStaff();
    if (!staff) return { ok: false, message: "Please sign in again." };

    // a discount only counts with a real approval slip for THIS shop and THIS %
    if (input.discountPct > 0 && !isApproved(input.discountToken, `discount:${business.id}:${input.discountPct}`)) {
        return { ok: false, message: "the discount needs the manager PIN again. Remove it and add it again." };
    }


    // rpc = call a database function (migration 005). Secret key = allowed to call it.
    const { data, error } = await supabaseAdmin.rpc("create_order", {
        p_business_id: business.id,
        p_order: {
            type: input.orderType,
            table: input.orderType === "dine_in" ? (input.table ?? "").trim().slice(0, 20) || null : null,
            source: "pos",
            method: input.method,
            tendered: input.tendered,
            expected_payable: input.expectedPayable,
            discount_pct: input.discountPct,
            lines: input.lines.map((l) => ({ item_id: l.itemId, qty: l.qty, option_ids: l.optionIds, note: l.note.trim().slice(0, 60) })),
        },
    });

    if (error) {
        console.error("create_order failed:", error); // shows in the terminal running npm run dev
        return { ok: false, message: MESSAGES[error.message] ?? "Couldn't save the order. Please try again." };
    }
    // stamp who rang it up (create_order doesn't know about logins, so a second small update)
    await supabaseAdmin
        .from("orders")
        .update({ staff_id: staff.id, cashier: staff.name })
        .eq("business_id", business.id)
        .eq("id", data.order_id);
    return { ok: true, orderId: data.order_id, orderNo: data.order_no, change: data.change };
}



// ---------- discount ----------

export type DiscountResult = { ok: true; token: string } | { ok: false; message: string };

// manager types the PIN → server checks it → gives back an approval slip for this discount
export async function approveDiscount(pct: number, pin: string): Promise<DiscountResult> {
    if (!DISCOUNTS.includes(pct)) return { ok: false, message: "Pick a discount." };

    const business = await getBusiness();
    if (!business) return { ok: false, message: "Shop not found" };

    const pinError = await checkManagerPin(business.id, pin);
    if (pinError) return { ok: false, message: pinError };

    return { ok: true, token: makeApproval(`discount:${business.id}:${pct}`) };
}