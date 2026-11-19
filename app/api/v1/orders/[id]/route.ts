import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// one saved line, as place_qr_order stored it
type Line = { name: string; qty: number; unit_sen: number; note?: string; options?: { name: string }[] };

// GET /api/v1/orders/<id> — the status of ONE QR order
// The id is long and random, so only the phone that placed the order knows it.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    // 1. the [id] part of the address
    const { id } = await params;
    if (!UUID.test(id)) {
        return Response.json({ error: "NOT_FOUND", message: "Order not found." }, { status: 404 });
    }

    // 2. the order + whether its bill is paid (orders.status)
    const { data: q } = await supabaseAdmin
        .from("qr_orders")
        .select("ticket_no, order_type, table_label, customer_name, status, reject_reason, lines, subtotal, created_at, orders(status)")
        .eq("id", id)
        .maybeSingle();
    if (!q) {
        return Response.json({ error: "NOT_FOUND", message: "Order not found." }, { status: 404 });
    }
    const bill = q.orders as unknown as { status: string } | null;

    // 3. a clean answer for the app
    return Response.json({
        id,
        ticketNo: q.ticket_no,
        type: q.order_type,
        table: q.table_label,
        name: q.customer_name,
        status: q.status, // new → preparing → ready → done   (or rejected)
        rejectReason: q.reject_reason,
        paid: bill?.status === "completed",
        subtotalSen: Math.round(Number(q.subtotal) * 100),
        createdAt: q.created_at,
        lines: ((q.lines ?? []) as Line[]).map((l) => ({
            name: l.name,
            qty: l.qty,
            options: (l.options ?? []).map((o) => o.name),
            note: l.note || null,
        })),
    });
}