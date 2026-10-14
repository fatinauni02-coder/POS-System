"use server";

import { refresh } from "next/cache";

import { getBusiness } from "@/lib/business";
import { checkManagerPin } from "@/lib/pin";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MESSAGES: Record<string, string> = {
  ORDER_NOT_FOUND: "Order not found.",
  ALREADY_REFUNDED: "This order was already refunded.",
  NOT_REFUNDABLE: "This order can't be refunded.",
};

// returns an error message, or null if the refund worked
export async function refundOrder(orderId: number, pin: string, restock: boolean): Promise<string | null> {
  if (!/^\d{4,6}$/.test(pin)) return "The PIN is 4 to 6 digits.";

  const business = await getBusiness();
  if (!business) return "Shop not found.";

  // checked HERE on the server — the browser can't skip it
  const pinError = await checkManagerPin(business.id, pin);
  if (pinError) return pinError;

  // migration 006: marks the order refunded and (if asked) puts the stock back
  const { error } = await supabaseAdmin.rpc("refund_order", {
    p_business_id: business.id,
    p_order_id: String(orderId),
    p_restock: restock,
  });
  if (error) {
    console.error("refund_order failed:", error);
    return MESSAGES[error.message] ?? "Couldn't refund. Please try again.";
  }

  refresh(); // redraw the receipt so it shows REFUNDED
  return null;
}