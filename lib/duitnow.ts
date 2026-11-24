import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type Duitnow = { qrUrl: string | null; name: string | null; inApp: boolean };

// The shop's DuitNow QR settings (migration 018).
// Kept OUT of getBusiness() on purpose: if 018 isn't run yet, only this returns null —
// the rest of the POS keeps working.
export async function getDuitnow(businessId: string): Promise<Duitnow | null> {
    const { data, error } = await supabaseAdmin
        .from("businesses")
        .select("duitnow_qr_url, duitnow_name, duitnow_in_app")
        .eq("id", businessId)
        .maybeSingle();
    if (error || !data) return null;
    return { qrUrl: data.duitnow_qr_url, name: data.duitnow_name, inApp: Boolean(data.duitnow_in_app) };
}

// What the customer's status screen needs to pay a bill by DuitNow — or null = nothing to pay in the app:
// not accepted yet (no bill), already paid, the shop switched it off, or DuitNow isn't a payment method.
export type BillPayment = { qrUrl: string; name: string | null; amountDueSen: number; claimed: boolean };

export async function billPayment(businessId: string, orderId: number | null): Promise<BillPayment | null> {
    if (orderId == null) return null; // QR order not accepted yet → no bill yet
    const [duitnow, { data: shop }, { data: bill, error }] = await Promise.all([
        getDuitnow(businessId),
        supabaseAdmin.from("businesses").select("sst_registered, sst_rate, payment_methods").eq("id", businessId).maybeSingle(),
        supabaseAdmin.from("orders").select("status, subtotal, pay_claimed_at").eq("id", orderId).eq("business_id", businessId).maybeSingle(),
    ]);
    if (!duitnow?.inApp || !duitnow.qrUrl || error || !bill || !shop) return null;
    if (bill.status !== "open") return null; // paid (completed) or refunded
    if (!((shop.payment_methods ?? []) as string[]).includes("duitnow")) return null; // staff couldn't record it as DuitNow

    // same totals as pay_bill (no discount from the app, no cash rounding: DuitNow isn't cash)
    // dine-in = the WHOLE table bill (every round), takeaway = this order's bill
    const subtotal = Math.round(Number(bill.subtotal) * 100);
    const rate = shop.sst_registered ? Number(shop.sst_rate) : 0;
    const sst = Math.round((subtotal * rate) / 100);
    return { qrUrl: duitnow.qrUrl, name: duitnow.name, amountDueSen: subtotal + sst, claimed: bill.pay_claimed_at != null };
}
