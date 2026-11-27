"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../shops/actions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logActivity } from "@/lib/activity";

// ADMIN → LOGINS: reset a shop login's password, lock / unlock it, make it the HQ of its company.
// Only shop logins (…@….pos); admin logins (….admin) are managed in Supabase.
const PAGE = "/admin/logins";

function back(q: string, message: string, kind: "saved" | "error"): never {
    redirect(`${PAGE}?${q ? `q=${encodeURIComponent(q)}&` : ""}${kind}=${encodeURIComponent(message)}&t=${Date.now()}`);
}

// the login must exist and be a shop login (…pos)
async function shopLogin(id: string, q: string) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
    const email = data?.user?.email ?? "";
    if (error || !email.endsWith(".pos")) back(q, "Login not found.", "error");
    return { id, userId: email.split("@")[0] };
}

export async function resetPassword(formData: FormData) {
    await requireAdmin();
    const q = String(formData.get("q") ?? "");
    const login = await shopLogin(String(formData.get("id") ?? ""), q);
    const password = String(formData.get("password") ?? "");
    if (password.length < 8) back(q, "Password must be at least 8 characters.", "error");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(login.id, { password });
    if (error) back(q, error.message, "error");
    await logActivity("login.password_reset", `Reset the password of ${login.userId}`);
    back(q, `New password set for "${login.userId}". Tell them, then they can sign in with it.`, "saved");
}

// locked = can't sign in (Supabase "ban"); a session already open ends within about an hour
export async function setLocked(formData: FormData) {
    await requireAdmin();
    const q = String(formData.get("q") ?? "");
    const login = await shopLogin(String(formData.get("id") ?? ""), q);
    const lock = formData.get("lock") === "1";

    const { error } = await supabaseAdmin.auth.admin.updateUserById(login.id, { ban_duration: lock ? "876000h" : "none" });
    if (error) back(q, error.message, "error");
    revalidatePath(PAGE);
    await logActivity(lock ? "login.locked" : "login.unlocked", `${lock ? "Locked" : "Unlocked"} ${login.userId}`);
    back(q, lock ? `"${login.userId}" is locked.` : `"${login.userId}" is unlocked.`, "saved");
}

// CHANGE HQ: this login becomes THE HQ of the company (one HQ per merchant; migration 024)
export async function makeHq(formData: FormData) {
    await requireAdmin();
    const q = String(formData.get("q") ?? "");
    const login = await shopLogin(String(formData.get("id") ?? ""), q);
    const companyId = String(formData.get("company_id") ?? "");

    const { error } = await supabaseAdmin.rpc("set_company_hq", { p_company: companyId, p_user: login.id });
    if (error) {
        const msg = error.message.includes("ALREADY_HQ_ELSEWHERE") ? "This login is already HQ of another merchant." : error.message;
        back(q, `${msg} (did you run migration 024?)`, "error");
    }
    revalidatePath("/", "layout");
    await logActivity("merchant.hq_changed", `${login.userId} is now the HQ`, companyId);
    back(q, `"${login.userId}" is now the HQ. The old HQ stays a login of its outlet(s).`, "saved");
}
