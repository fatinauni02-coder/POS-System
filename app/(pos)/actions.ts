"use server"; // everything in this file runs ONLY on the server (never in the browser)

import { getBusiness } from "@/lib/business";
import { getDuitnow } from "@/lib/duitnow";
import { discountApprovedBy, makeDiscountApproval } from "@/lib/approval";
import { DISCOUNTS } from "@/lib/money";
import { approve } from "@/lib/pin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaff } from "@/lib/staff"
import { refresh } from "next/cache";

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
    note?: string; // kitchen note for the whole order (printed on the tickets)
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
    TABLE_NOT_FOUND: "This table was removed. Go back to Tables.",
    NOT_OPEN: "This bill was already paid or closed. Go back to Tables.",
    EMPTY_BILL: "There is nothing to pay on this bill.",
    LINE_NOT_FOUND: "That item is no longer on the bill.",
    ALREADY_VOIDED: "That item was already voided.",
    EMPTY_SPLIT: "Pick at least one item to pay for.",
    BAD_SPLIT: "The bill changed. Refresh the page and pick the items again.",
    SAME_TABLE: "The bill is already on that table.",
    TABLE_BUSY: "That table already has a bill. Pick a free table.",
};

export async function placeOrder(input: OrderInput): Promise<OrderResult> {
    const business = await getBusiness();
    if (!business) return { ok: false, message: "Shop not found" };
    const staff = await getStaff();
    if (!staff) return { ok: false, message: "Please sign in again." };

    // a discount only counts with a real approval slip for THIS shop and THIS %
    // who approved it (null = no discount, or the slip isn't real)
    const discountBy = input.discountPct > 0 ? discountApprovedBy(input.discountToken, business.id, input.discountPct) : null;
    if (input.discountPct > 0 && !discountBy) {
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
            note: (input.note ?? "").trim().slice(0, 200), // create_order saves it in orders.note
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
        .update({ staff_id: staff.id, cashier: staff.name, discount_by: discountBy })
        .eq("business_id", business.id)
        .eq("id", data.order_id);
    return { ok: true, orderId: data.order_id, orderNo: data.order_no, change: data.change };
}



// ---------- restaurant mode: send a round to the kitchen ----------

export type SendResult = { ok: true; orderId: number; orderNo: number; round: number } | { ok: false; message: string };

// The cart becomes the next round on the table's bill (migration 010, send_round):
// first send opens the bill; stock is taken now; payment comes later with "Pay bill".
export async function sendRound(input: { table: string; lines: OrderInput["lines"]; note?: string }): Promise<SendResult> {
    const business = await getBusiness();
    if (!business) return { ok: false, message: "Shop not found" };
    const staff = await getStaff();
    if (!staff) return { ok: false, message: "Please sign in again." };

    const { data, error } = await supabaseAdmin.rpc("send_round", {
        p_business_id: business.id,
        p_table: input.table.trim().slice(0, 20),
        p_lines: input.lines.map((l) => ({ item_id: l.itemId, qty: l.qty, option_ids: l.optionIds, note: l.note.trim().slice(0, 60) })),
        p_note: (input.note ?? "").trim().slice(0, 200) || null, // added to the bill's note (010 / 011)
    });

    if (error) {
        console.error("send_round failed:", error);
        return { ok: false, message: MESSAGES[error.message] ?? "Couldn't send the order. Please try again." };
    }
    return { ok: true, orderId: data.order_id, orderNo: data.order_no, round: data.round };
}

// ---------- restaurant mode: pay the whole table bill ----------

export type PayBillInput = Omit<OrderInput, "lines" | "orderType" | "table"> & { orderId: number };

// Totals every round on the bill (voided lines left out), discount / SST / cash rounding,
// takes the payment and closes the bill (migration 010, pay_bill). The table is free again after.
export async function payBill(input: PayBillInput): Promise<OrderResult> {
    const business = await getBusiness();
    if (!business) return { ok: false, message: "Shop not found" };
    const staff = await getStaff();
    if (!staff) return { ok: false, message: "Please sign in again." };

    // same rule as placeOrder: a discount only counts with a real approval slip
    // who approved it (null = no discount, or the slip isn't real)
    const discountBy = input.discountPct > 0 ? discountApprovedBy(input.discountToken, business.id, input.discountPct) : null;
    if (input.discountPct > 0 && !discountBy) {
        return { ok: false, message: "the discount needs the manager PIN again. Remove it and add it again." };
    }

    const { data, error } = await supabaseAdmin.rpc("pay_bill", {
        p_business_id: business.id,
        p_order_id: String(input.orderId),
        p_pay: {
            method: input.method,
            tendered: input.tendered,
            expected_payable: input.expectedPayable,
            discount_pct: input.discountPct,
        },
    });

    if (error) {
        console.error("pay_bill failed:", error);
        return { ok: false, message: MESSAGES[error.message] ?? "Couldn't take the payment. Please try again." };
    }
    // the cashier = whoever took the payment
    await supabaseAdmin
        .from("orders")
        .update({ staff_id: staff.id, cashier: staff.name, discount_by: discountBy })
        .eq("business_id", business.id)
        .eq("id", data.order_id);
    return { ok: true, orderId: data.order_id, orderNo: data.order_no, change: data.change };
}

// ---------- restaurant mode: SPLIT BILL — pay some items as their own receipt ----------

export type SplitLine = { lineId: number; qty: number };

// migration 014, pay_split: the picked items move to a NEW paid order (own receipt, own payment);
// the rest stays on the table. Picking everything left = paying the whole bill.
// wholeBill = true → the table is free now.
export async function paySplit(input: PayBillInput & { lines: SplitLine[] }): Promise<OrderResult & { wholeBill?: boolean }> {
    const business = await getBusiness();
    if (!business) return { ok: false, message: "Shop not found" };
    const staff = await getStaff();
    if (!staff) return { ok: false, message: "Please sign in again." };

    // who approved it (null = no discount, or the slip isn't real)
    const discountBy = input.discountPct > 0 ? discountApprovedBy(input.discountToken, business.id, input.discountPct) : null;
    if (input.discountPct > 0 && !discountBy) {
        return { ok: false, message: "the discount needs the manager PIN again. Remove it and add it again." };
    }
    const lines = input.lines.filter((l) => Number.isInteger(l.lineId) && Number.isInteger(l.qty) && l.qty > 0);
    if (lines.length === 0) return { ok: false, message: MESSAGES.EMPTY_SPLIT };

    const { data, error } = await supabaseAdmin.rpc("pay_split", {
        p_business_id: business.id,
        p_order_id: String(input.orderId),
        p_lines: lines.map((l) => ({ line_id: l.lineId, qty: l.qty })),
        p_pay: {
            method: input.method,
            tendered: input.tendered,
            expected_payable: input.expectedPayable,
            discount_pct: input.discountPct,
        },
    });
    if (error) {
        console.error("pay_split failed:", error);
        return { ok: false, message: MESSAGES[error.message] ?? "Couldn't take the payment. Please try again." };
    }
    // the cashier = whoever took this payment
    await supabaseAdmin
        .from("orders")
        .update({ staff_id: staff.id, cashier: staff.name, discount_by: discountBy })
        .eq("business_id", business.id)
        .eq("id", data.order_id);
    return { ok: true, orderId: data.order_id, orderNo: data.order_no, change: data.change, wholeBill: data.whole_bill === true };
}

// ---------- restaurant mode: MOVE BILL to another (free) table ----------

// returns an error message, or null if it worked
export async function moveBill(orderId: number, table: string): Promise<string | null> {
    const business = await getBusiness();
    if (!business) return "Shop not found.";
    if (!(await getStaff())) return "Please sign in again.";

    // migration 014: the target table must be free; QR orders on the bill move with it
    const { error } = await supabaseAdmin.rpc("move_bill", {
        p_business_id: business.id,
        p_order_id: String(orderId),
        p_table: table,
    });
    if (error) {
        console.error("move_bill failed:", error);
        return MESSAGES[error.message] ?? "Couldn't move the bill. Please try again.";
    }
    return null;
}

// ---------- restaurant mode: void one sent line (manager PIN) ----------

// returns an error message, or null if it worked
export async function voidLine(lineId: number, pin: string, restock: boolean): Promise<string | null> {
    const business = await getBusiness();
    if (!business) return "Shop not found.";
    const staff = await getStaff();
    if (!staff) return "Please sign in again.";

    // checked HERE on the server — the browser can't skip it (unless the shop turned the PIN off for voids)
    const check = await approve(business, "void", pin, staff.name);
    if (!check.ok) return check.message;

    // migration 010: marks the line voided, puts its stock back (if asked), updates the bill;
    // if nothing is left on the bill, the bill closes and the table is free
    const { error } = await supabaseAdmin.rpc("void_line", {
        p_business_id: business.id,
        p_line_id: String(lineId),
        p_restock: restock,
    });
    if (error) {
        console.error("void_line failed:", error);
        return MESSAGES[error.message] ?? "Couldn't void the item. Please try again.";
    }
    // who approved the void (migration 015)
    await supabaseAdmin.from("order_items").update({ voided_by: check.by }).eq("business_id", business.id).eq("id", lineId);

    refresh(); // redraw the table screen with the new bill
    return null;
}

// ---------- discount ----------

export type DiscountResult = { ok: true; token: string } | { ok: false; message: string };

// manager types the PIN → server checks it → gives back an approval slip for this discount
export async function approveDiscount(pct: number, pin: string): Promise<DiscountResult> {
    if (!DISCOUNTS.includes(pct)) return { ok: false, message: "Pick a discount." };

    const business = await getBusiness();
    if (!business) return { ok: false, message: "Shop not found" };
    const staff = await getStaff();
    if (!staff) return { ok: false, message: "Please sign in again." };

    // the PIN (or, if the shop turned it off for discounts, just whoever is signed in)
    const check = await approve(business, "discount", pin, staff.name);
    if (!check.ok) return { ok: false, message: check.message };

    // the slip remembers WHO approved (saved on the order when it's paid)
    return { ok: true, token: makeDiscountApproval(business.id, pct, check.by) };
}

// The shop's DuitNow QR for the counter checkout (Settings → Payments, migration 018).
// null = no QR uploaded (the checkout then shows the plain "Customer scans DuitNow QR" box).
export async function shopDuitnowQr(): Promise<{ url: string; name: string | null } | null> {
    if (!(await getStaff())) return null; // signed-in staff only
    const business = await getBusiness();
    if (!business) return null;
    const duitnow = await getDuitnow(business.id);
    return duitnow?.qrUrl ? { url: duitnow.qrUrl, name: duitnow.name } : null;
}
