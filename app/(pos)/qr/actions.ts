"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { getBusiness } from "@/lib/business";
import { getStaff, requireManager } from "@/lib/staff";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyQrOrder } from "@/lib/push";

const PAGE = "/qr";

// back to the board with a toast
function back(kind: "msg" | "error", text: string): never {
    revalidatePath("/", "layout"); // also updates the "QR" badge in the sidebar
    redirect(`${PAGE}?${kind}=${encodeURIComponent(text)}&t=${Date.now()}`);
}

// database codes (migration 011) → words for staff
const MESSAGES: Record<string, string> = {
    QR_ORDER_NOT_FOUND: "That order is gone. The board was refreshed.",
    NOT_NEW: "Someone already accepted or rejected that order.",
    BAD_STATUS: "That order already moved on. The board was refreshed.",
    OUT_OF_STOCK: "Not enough stock for this order. Reject it or receive stock first.",
    ITEM_UNAVAILABLE: "An item in this order is sold out now. Reject it.",
    TABLE_NOT_FOUND: "That table was removed. Reject the order.",
    BAD_OPTION: "The menu changed since the customer ordered. Reject it.",
    OPTION_REQUIRED: "The menu changed since the customer ordered. Reject it.",
};

// every board action: a signed-in staff member of THIS shop
async function shopForStaff() {
    if (!(await getStaff())) back("error", "Please sign in again.");
    const business = await getBusiness();
    if (!business) back("error", "Shop not found");
    return business;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function qrId(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!UUID.test(id)) back("error", "That order is gone.");
    return id;
}

// Accept: dine-in → next round on the table's bill; takeaway → a new takeaway bill. Stock is taken now.
export async function acceptQr(formData: FormData) {
    const business = await shopForStaff();
    const id = qrId(formData);
    const { data, error } = await supabaseAdmin.rpc("accept_qr_order", { p_business_id: business.id, p_id: id });
    if (error) {
        console.error("accept_qr_order failed:", error);
        back("error", MESSAGES[error.message] ?? "Couldn't accept the order. Please try again.");
    }
    back("msg", `Accepted Q${data.ticket_no} — print its tickets from the Preparing column`);
}

export async function rejectQr(formData: FormData) {
    const business = await shopForStaff();
    const id = qrId(formData);
    const reason = String(formData.get("reason") ?? "").trim().slice(0, 120);
    const { error } = await supabaseAdmin.rpc("reject_qr_order", { p_business_id: business.id, p_id: id, p_reason: reason });
    if (error) back("error", MESSAGES[error.message] ?? "Couldn't reject the order.");
    after(() => notifyQrOrder(business.id, id, "rejected")); // push to the app, after the board answers
    back("msg", "Order rejected — the customer sees the reason on their phone");
}

// Preparing → Ready, Ready → Done (served / collected)
export async function moveQr(formData: FormData) {
    const business = await shopForStaff();
    const id = qrId(formData);
    const status = formData.get("status") === "done" ? "done" : "ready";
    const { error } = await supabaseAdmin.rpc("set_qr_status", { p_business_id: business.id, p_id: id, p_status: status });
    if (error) back("error", MESSAGES[error.message] ?? "Couldn't update the order.");
    if (status === "ready") after(() => notifyQrOrder(business.id, id, "ready")); // "Your order Q12 is ready!"
    back("msg", status === "ready" ? "Marked ready — the customer sees it on their phone" : "Done");
}

// "Collected" straight from the payment pop-up (takeaway): Preparing/Ready → Done in one tap
export async function collectQr(formData: FormData) {
    const business = await shopForStaff();
    const id = qrId(formData);
    const { data: q } = await supabaseAdmin
        .from("qr_orders")
        .select("ticket_no, status")
        .eq("business_id", business.id)
        .eq("id", id)
        .maybeSingle();
    if (!q) back("error", "That order is gone.");
    if (q.status === "done") back("msg", `Q${q.ticket_no} was already collected`);

    // set_qr_status only moves one step at a time: preparing → ready → done
    if (q.status === "preparing") {
        const { error } = await supabaseAdmin.rpc("set_qr_status", { p_business_id: business.id, p_id: id, p_status: "ready" });
        if (error) back("error", MESSAGES[error.message] ?? "Couldn't update the order.");
    }
    const { error } = await supabaseAdmin.rpc("set_qr_status", { p_business_id: business.id, p_id: id, p_status: "done" });
    if (error) back("error", MESSAGES[error.message] ?? "Couldn't update the order.");
    back("msg", `Q${q.ticket_no} paid and collected`);
}

// pause / restart QR ordering (managers)
export async function setQrOrdering(formData: FormData) {
    await requireManager();
    const business = await shopForStaff();
    const on = formData.get("on") === "true";
    const { error } = await supabaseAdmin.from("businesses").update({ qr_ordering: on }).eq("id", business.id);
    if (error) back("error", error.message);
    back("msg", on ? "QR ordering is ON" : "QR ordering is paused — customers are asked to order at the counter");
}
