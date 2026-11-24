import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { billPayment } from "@/lib/duitnow";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/v1/orders/<id>/paid — the customer tapped "I've paid" (DuitNow QR)
// This is only a HINT for staff: it never marks the bill paid. Staff check their bank,
// then Take payment → DuitNow QR. Tapping twice is fine (nothing changes the 2nd time).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!UUID.test(id)) {
        return Response.json({ error: "NOT_FOUND", message: "Order not found." }, { status: 404 });
    }

    // 1. the QR order → which shop + which bill
    const { data: q } = await supabaseAdmin.from("qr_orders").select("business_id, order_id").eq("id", id).maybeSingle();
    if (!q) {
        return Response.json({ error: "NOT_FOUND", message: "Order not found." }, { status: 404 });
    }

    // 2. same checks as the status screen: accepted, not paid yet, DuitNow switched on
    const payment = await billPayment(q.business_id, q.order_id);
    if (!payment) {
        return Response.json(
            { error: "CANT_PAY_NOW", message: "This order can't be paid in the app right now. Please pay at the counter." },
            { status: 422 },
        );
    }

    // 3. remember WHEN they said so (the board shows "Customer says paid"; the trigger in 018 tells it live)
    if (!payment.claimed) {
        const { error } = await supabaseAdmin
            .from("orders")
            .update({ pay_claimed_at: new Date().toISOString() })
            .eq("id", q.order_id)
            .eq("status", "open")
            .is("pay_claimed_at", null);
        if (error) {
            console.error("pay claim failed:", error);
            return Response.json({ error: "SERVER_ERROR", message: "Couldn't send. Please tell the staff you've paid." }, { status: 500 });
        }
    }
    return Response.json({ claimed: true, amountDueSen: payment.amountDueSen });
}
