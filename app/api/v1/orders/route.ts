import type { NextRequest } from "next/server";
import { after } from "next/server";
import { placeQrOrder } from "@/app/(customer)/order/actions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PUSH_TOKEN } from "@/lib/push";

// POST /api/v1/orders — the app sends its cart; the server checks everything and saves it
export async function POST(request: NextRequest) {
    // 1. read the JSON body (broken JSON → 400)
    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "BAD_JSON", message: "The body must be JSON." }, { status: 400 });
    }

    // 2. check the shape: lines must be a list
    if (!body || typeof body.code !== "string" || !Array.isArray(body.lines)) {
        return Response.json({ error: "BAD_REQUEST", message: "Send code and lines." }, { status: 400 });
    }

    // 3. the SAME function the web QR page uses (prices, sold-out, paused… are all checked in the database)
    const result = await placeQrOrder({
        code: body.code,
        type: body.type === "takeaway" ? "takeaway" : "dine_in",
        name: String(body.name ?? ""),
        note: String(body.note ?? ""),
        lines: body.lines.map((l: { itemId: number; qty: number; optionIds?: string[]; note?: string }) => ({
            itemId: Number(l.itemId),
            qty: Number(l.qty),
            optionIds: Array.isArray(l.optionIds) ? l.optionIds : [],
            note: String(l.note ?? ""),
        })),
    });

    // 4. refused (sold out, paused, missing choice…) → 422 = "I understood, but I can't do it"
    if (!result.ok) {
        return Response.json({ error: "ORDER_REFUSED", message: result.message }, { status: 422 });
    }

    // 5. the app's push token (optional) → saved after we answer, so the customer isn't kept waiting
    const pushToken = typeof body.pushToken === "string" && PUSH_TOKEN.test(body.pushToken) ? body.pushToken : null;
    if (pushToken) {
        const orderId = result.id;
        after(async () => {
            const { error } = await supabaseAdmin.from("qr_orders").update({ push_token: pushToken }).eq("id", orderId);
            if (error) console.error("saving push token failed:", error);
        });
    }

    // 6. saved → 201 Created + the Q-number and the id to track it
    return Response.json({ id: result.id, ticketNo: result.ticketNo, status: "new" }, { status: 201 });
}