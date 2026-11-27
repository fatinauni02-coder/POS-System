import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// "ali" → "ali@kopi-co.pos" (whichever shop ali belongs to), or null if no such User ID.
// A real email (with @) is used as it is. Needs migration 020.
export async function loginEmailFor(typed: string) {
    const value = typed.trim().toLowerCase();
    if (!value) return null;
    if (value.includes("@")) return value;
    const { data, error } = await supabaseAdmin.rpc("login_email_for", { p_user_id: value });
    if (error) throw new Error(`login lookup failed: ${error.message} (did you run migration 020?)`);
    return (data as string | null) ?? null;
}

// User IDs are unique across all shops: true = someone already has it
export async function userIdTaken(userId: string) {
    return (await loginEmailFor(userId)) !== null;
}
