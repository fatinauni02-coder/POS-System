import "server-only";
import { userIdTaken } from "@/lib/login-lookup";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toLoginEmail, USERNAME_PATTERN } from "@/lib/username";

// CREATING OUTLETS + LOGINS — shared by Admin (register a merchant) and HQ (add an outlet).
// Every function returns an error message (string) or the result; nothing here redirects.

// "Kopi & Co. Bangsar" → "kopi-co-bangsar-x7k2": the outlet's internal code (also the ending of its logins).
// Made automatically so nobody has to invent one; the random end keeps it unique.
function makeCode(name: string) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "outlet";
    const tail = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
    return `${base}-${tail}`;
}

// a new login's User ID + password, checked the same way everywhere
export async function checkLogin(userId: string, password: string): Promise<string | null> {
    if (!USERNAME_PATTERN.test(userId)) return "User ID: 3–20 letters or numbers, no spaces.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (await userIdTaken(userId)) return `User ID "${userId}" is already taken (User IDs are unique across all shops).`;
    return null;
}

export type OutletDetails = { address?: string | null; phone?: string | null };

// settings a new outlet starts with, copied from HQ: tax, rounding, receipt, payments, service style (Tables), QR, PIN, printing
const HQ_SETTINGS =
    "sst_registered, sst_rate, sst_reg_no, prices_include_tax, rounding_enabled, receipt_header, receipt_footer, receipt_show_logo, payment_methods, service_mode, qr_ordering, pin_for, auto_print";

// the outlet row; tries a fresh code if one is already used.
//   label     = which outlet: "HQ", "Johor Bharu"
//   brandName = the business name, only for a company's FIRST outlet (later outlets copy HQ's brand:
//               name, logo, tagline, colours) — plus the outlet's own address and phone.
export async function createOutlet(
    companyId: string,
    label: string,
    details: OutletDetails = {},
    brandName?: string,
): Promise<{ id: string; code: string } | string> {
    const { data: company } = await supabaseAdmin.from("companies").select("hq_business_id").eq("id", companyId).maybeSingle();
    const { data: hq } = company?.hq_business_id
        ? await supabaseAdmin.from("businesses").select(`name, logo_url, tagline, theme, ${HQ_SETTINGS}`).eq("id", company.hq_business_id).maybeSingle()
        : { data: null };
    // a new outlet = a copy of HQ: brand (kept in sync) + HQ's settings to start with (the outlet can change those later)
    const brand = hq ? { ...hq } : { name: brandName ?? label };

    for (let i = 0; i < 3; i++) {
        const code = makeCode(`${brand.name} ${label}`);
        const { data, error } = await supabaseAdmin
            .from("businesses")
            .insert({
                ...brand,
                outlet_label: label,
                slug: code,
                login_domain: `${code}.pos`,
                company_id: companyId,
                address: details.address ?? null,
                phone: details.phone ?? null,
            })
            .select("id")
            .single();
        if (data) return { id: data.id as string, code };
        if (error?.code !== "23505") return `Couldn't add the outlet: ${error?.message}`;
    }
    return "Couldn't add the outlet, please try again.";
}

// a login "<user id>@<code>.pos" that can sign in straight away
export async function createLogin(userId: string, password: string, code: string): Promise<{ id: string } | string> {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email: toLoginEmail(userId, `${code}.pos`), password, email_confirm: true });
    if (error || !data.user) return `Couldn't create the login: ${error?.message}`;
    return { id: data.user.id };
}

// HQ users are owners in EVERY outlet of their company (so all POS pages just work for them)
export async function addHqToOutlet(companyId: string, outletId: string) {
    const { data: hq } = await supabaseAdmin.from("company_members").select("user_id").eq("company_id", companyId);
    const rows = (hq ?? []).map((h) => ({ business_id: outletId, user_id: h.user_id as string, role: "owner" }));
    if (rows.length) await supabaseAdmin.from("business_members").upsert(rows, { onConflict: "business_id,user_id" });
}

// ADD AN OUTLET to a company + its manager login (HQ users get in too). Undoes itself if a step fails.
export async function addOutletWithManager(
    companyId: string,
    label: string,
    managerId: string,
    password: string,
    details: OutletDetails = {},
): Promise<string | null> {
    const bad = await checkLogin(managerId, password);
    if (bad) return bad;

    const outlet = await createOutlet(companyId, label, details);
    if (typeof outlet === "string") return outlet;

    const login = await createLogin(managerId, password, outlet.code);
    if (typeof login === "string") {
        await supabaseAdmin.from("businesses").delete().eq("id", outlet.id);
        return login;
    }

    const { error } = await supabaseAdmin.from("business_members").insert({ business_id: outlet.id, user_id: login.id, role: "manager" });
    if (error) {
        await supabaseAdmin.auth.admin.deleteUser(login.id);
        await supabaseAdmin.from("businesses").delete().eq("id", outlet.id);
        return `Couldn't link the manager: ${error.message}`;
    }
    await addHqToOutlet(companyId, outlet.id);
    return null;
}
