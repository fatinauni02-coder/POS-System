"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/admins";
import { SHOP_COOKIE } from "@/lib/business";
import { loginEmailFor } from "@/lib/login-lookup";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseAuth } from "@/lib/supabase-server";

// MERCHANT sign-in: User ID + Password only. The shop comes from the account:
//   1. "ali" → "ali@kopi-co.pos" (migration 020)
//   2. sign in
//   3. ali's shop (business_members) → remembered on this device → /merchant
export async function signIn(formData: FormData) {
    if (formData.get("portal") === "admin") return adminSignIn(formData);

    const email = await loginEmailFor(String(formData.get("username") ?? ""));
    if (!email) redirect("/merchant/login?error=1");

    const supabase = await supabaseAuth();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: String(formData.get("password") ?? "") });
    if (error || !data.user) redirect("/merchant/login?error=1");

    // which shop(s) this login works at
    const { data: rows } = await supabaseAdmin
        .from("business_members")
        .select("business_id, businesses(is_active)")
        .eq("user_id", data.user.id);
    const shops = (rows ?? []).map((r) => ({
        id: r.business_id as string,
        active: (r.businesses as unknown as { is_active: boolean } | null)?.is_active !== false,
    }));
    const open = shops.filter((s) => s.active);

    if (open.length === 0) {
        await supabase.auth.signOut();
        redirect(`/merchant/login?error=${shops.length > 0 ? "off" : "1"}`); // switched off, or not staff anywhere
    }

    // works at more than one shop → keep the one remembered on this device, else the first
    const jar = await cookies();
    const remembered = jar.get(SHOP_COOKIE)?.value;
    const shopId = open.some((s) => s.id === remembered) ? remembered! : open[0].id;
    jar.set(SHOP_COOKIE, shopId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });

    redirect("/merchant");
}

// ADMIN sign-in: User ID ("auni") or full email; only logins in ADMIN_EMAILS get in
async function adminSignIn(formData: FormData) {
    const typed = String(formData.get("username") ?? "").trim().toLowerCase();
    const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    // "auni" → the admin email that starts with "auni@"
    const email = typed.includes("@") ? typed : admins.find((a) => a.startsWith(`${typed}@`));
    if (!email || !isAdminEmail(email)) redirect("/admin/login?error=admin");

    const supabase = await supabaseAuth();
    const { error } = await supabase.auth.signInWithPassword({ email, password: String(formData.get("password") ?? "") });
    if (error) redirect("/admin/login?error=1");

    redirect("/admin");
}

// back to the sign-in page of the portal you were in (the remembered shop stays on this device)
export async function signOut() {
    const supabase = await supabaseAuth();
    await supabase.auth.signOut(); // removes the login cookie
    const from = (await headers()).get("referer") ?? "";
    const path = from ? new URL(from).pathname : "";
    redirect(path === "/admin" || path.startsWith("/admin/") ? "/admin/login" : "/merchant/login");
}

// HQ OUTLET SWITCHER (top bar): remember the picked outlet on this device, then open its home page
// (only outlets you're a member of, and switched on; the page you were on may not exist in the other outlet)
export async function switchOutlet(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const supabase = await supabaseAuth();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;
    if (!userId) redirect("/merchant/login");

    const { data: row } = await supabaseAdmin
        .from("business_members")
        .select("businesses(is_active)")
        .eq("business_id", id)
        .eq("user_id", userId)
        .maybeSingle();
    const shop = row?.businesses as unknown as { is_active: boolean } | null;

    const from = (await headers()).get("referer") ?? "";
    const path = from ? new URL(from).pathname : "";
    const home = path === "/admin" || path.startsWith("/admin/") ? "/admin" : "/merchant";
    if (!shop || shop.is_active === false) redirect(home); // not yours / switched off → stay put

    (await cookies()).set(SHOP_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
    redirect(home);
}
