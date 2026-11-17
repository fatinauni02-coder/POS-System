"use server"; // runs only on the server — the customer's phone never gets the secret key

import { supabaseAdmin } from "@/lib/supabase-admin";

export type QrOrderInput = {
    code: string; // the QR code (table or counter)
    type: "dine_in" | "takeaway";
    name: string; // takeaway: who to call
    note: string;
    lines: { itemId: number; qty: number; optionIds: string[]; note: string }[];
};
export type QrOrderResult = { ok: true; id: string; ticketNo: number } | { ok: false; message: string };

// place_qr_order (migration 011) raises short codes; turn them into words for the customer
const MESSAGES: Record<string, string> = {
    QR_NOT_FOUND: "This QR code isn't valid any more. Please ask the staff.",
    QR_PAUSED: "Ordering by QR is paused right now. Please order at the counter.",
    BAD_ORDER_TYPE: "Please choose dine-in or takeaway again.",
    NAME_REQUIRED: "Please type your name for takeaway.",
    TOO_MANY: "You already have orders waiting. Please wait for the staff to accept them.",
    EMPTY_ORDER: "Your cart is empty.",
    ITEM_UNAVAILABLE: "Something in your cart just sold out. Remove it and try again.",
    BAD_OPTION: "The menu changed. Remove that item and add it again.",
    OPTION_REQUIRED: "An item is missing a choice. Remove it and add it again.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// No login here (customers). Everything is checked in the database:
// real prices, options, sold-out, paused, max 3 waiting orders per QR code.
// Nothing goes to the kitchen and no stock is taken until staff press Accept.
export async function placeQrOrder(input: QrOrderInput): Promise<QrOrderResult> {
    if (!UUID.test(input.code)) return { ok: false, message: MESSAGES.QR_NOT_FOUND };
    if (input.lines.length === 0) return { ok: false, message: MESSAGES.EMPTY_ORDER };

    const { data, error } = await supabaseAdmin.rpc("place_qr_order", {
        p_code: input.code,
        p_type: input.type,
        p_name: input.name.trim().slice(0, 30),
        p_note: input.note.trim().slice(0, 200),
        p_lines: input.lines.slice(0, 50).map((l) => ({
            item_id: l.itemId,
            qty: l.qty,
            option_ids: l.optionIds,
            note: l.note.trim().slice(0, 60),
        })),
    });
    if (error) {
        console.error("place_qr_order failed:", error);
        return { ok: false, message: MESSAGES[error.message] ?? "Couldn't send your order. Please try again or ask the staff." };
    }
    return { ok: true, id: data.id, ticketNo: data.ticket_no };
}
