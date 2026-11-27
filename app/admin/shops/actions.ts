"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/admins";
import { logActivity } from "@/lib/activity";
import { checkLogin, createLogin, createOutlet } from "@/lib/outlet-setup";
import { FEATURES, PLANS, type Features, type Plan } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseAuth } from "@/lib/supabase-server";

// ADMIN: register MERCHANTS (company + first outlet + HQ login). The merchant's HQ adds more outlets
// itself in /merchant/outlets. Admin can still switch an outlet off or rename. Needs migration 021.
const PAGE = "/admin/shops";

function fail(message: string): never {
    redirect(`${PAGE}?error=${encodeURIComponent(message)}&t=${Date.now()}`);
}
function done(message: string): never {
    revalidatePath(PAGE);
    redirect(`${PAGE}?saved=${encodeURIComponent(message)}&t=${Date.now()}`);
}

// every action checks again: only ADMIN_EMAILS (proxy.ts also blocks /admin for everyone else)
export async function requireAdmin() {
    const supabase = await supabaseAuth();
    const { data } = await supabase.auth.getClaims();
    if (!isAdminEmail(data?.claims?.email)) redirect("/admin/login");
}

// REGISTER A MERCHANT: company + its first outlet + the HQ login (owner of the outlet)
export async function addCompany(formData: FormData) {
    await requireAdmin();
    const companyName = String(formData.get("company_name") ?? "").trim().slice(0, 80);
    const outletName = String(formData.get("outlet_name") ?? "").trim().slice(0, 60) || "HQ"; // first outlet's label
    const hqId = String(formData.get("hq") ?? "").trim().toLowerCase();
    const password = String(formData.get("hq_password") ?? "");
    if (!companyName) fail("Type the company name.");
    const bad = await checkLogin(hqId, password);
    if (bad) fail(bad);

    const { data: company, error } = await supabaseAdmin.from("companies").insert({ name: companyName }).select("id").single();
    if (error || !company) fail(`Couldn't add the company: ${error?.message} (did you run migration 021?)`);
    const dropCompany = () => supabaseAdmin.from("companies").delete().eq("id", company.id);

    const outlet = await createOutlet(company.id, outletName, {}, companyName); // business name = the company's name
    if (typeof outlet === "string") {
        await dropCompany();
        fail(outlet);
    }

    const login = await createLogin(hqId, password, outlet.code);
    if (typeof login === "string") {
        await supabaseAdmin.from("businesses").delete().eq("id", outlet.id);
        await dropCompany();
        fail(login);
    }

    const [{ error: e1 }, { error: e2 }, { error: e3 }] = await Promise.all([
        supabaseAdmin.from("company_members").insert({ company_id: company.id, user_id: login.id, role: "hq" }),
        supabaseAdmin.from("business_members").insert({ business_id: outlet.id, user_id: login.id, role: "owner" }),
        supabaseAdmin.from("companies").update({ hq_business_id: outlet.id }).eq("id", company.id), // its menu = the HQ menu
    ]);
    if (e1 || e2 || e3) {
        await supabaseAdmin.auth.admin.deleteUser(login.id);
        await supabaseAdmin.from("businesses").delete().eq("id", outlet.id);
        await dropCompany();
        fail(`Couldn't link the HQ login: ${(e1 ?? e2 ?? e3)?.message}`);
    }

    await logActivity("merchant.registered", `Registered ${companyName} (HQ: ${hqId})`, company.id);
    done(`${companyName} registered. HQ signs in at /merchant/login as "${hqId}" and adds more outlets in Outlets.`);
}

// SWITCH AN OUTLET ON / OFF: off = nobody in that outlet can sign in (nothing is deleted)
export async function setShopActive(formData: FormData) {
    await requireAdmin();
    const id = String(formData.get("id") ?? "");
    const active = formData.get("active") === "1";
    const { data: outlet, error } = await supabaseAdmin
        .from("businesses")
        .update({ is_active: active })
        .eq("id", id)
        .select("name, outlet_label, company_id")
        .maybeSingle();
    if (error) fail(error.message);
    await logActivity(active ? "outlet.on" : "outlet.off", `${active ? "Switched on" : "Switched off"} ${outlet?.name ?? "?"} · ${outlet?.outlet_label ?? ""}`, outlet?.company_id);
    done(active ? "Outlet switched on." : "Outlet switched off.");
}

// RENAME an outlet or a company
export async function renameShop(formData: FormData) {
    await requireAdmin();
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim().slice(0, 60);
    if (!name) fail("Type the name.");
    // the OUTLET's name ("HQ", "Johor Bharu"); the business name is the brand, changed in Settings at HQ
    const { data: outlet, error } = await supabaseAdmin
        .from("businesses")
        .update({ outlet_label: name })
        .eq("id", id)
        .select("name, company_id")
        .maybeSingle();
    if (error) fail(error.message);
    await logActivity("outlet.renamed", `Renamed an outlet of ${outlet?.name ?? "?"} to ${name}`, outlet?.company_id);
    revalidatePath("/", "layout");
    done("Outlet name saved.");
}

export async function renameCompany(formData: FormData) {
    await requireAdmin();
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim().slice(0, 80);
    if (!name) fail("Type the name.");
    const { error } = await supabaseAdmin.from("companies").update({ name }).eq("id", id);
    if (error) fail(error.message);
    await logActivity("merchant.renamed", `Renamed a merchant to ${name}`, id);
    done("Company name saved.");
}

// PLAN & FEATURES of a merchant (migration 028). Basic / Pro / Premium = ready-made; Custom = the ticks.
// Turning a feature OFF also switches it off in every outlet, so it really stops:
//   QR ordering → paused · Tables → cafe mode · DuitNow in the app → off
export async function setPlan(formData: FormData) {
    await requireAdmin();
    const id = String(formData.get("company_id") ?? "");
    const plan = String(formData.get("plan") ?? "") as Plan;
    if (!["basic", "pro", "premium", "custom"].includes(plan)) fail("Pick a plan.");

    const features: Features =
        plan === "custom"
            ? (Object.fromEntries(FEATURES.map((f) => [f.key, formData.get(`f_${f.key}`) === "on"])) as Features)
            : { ...PLANS[plan as Exclude<Plan, "custom">].features };

    const { data: company, error } = await supabaseAdmin.from("companies").update({ plan, features }).eq("id", id).select("name").maybeSingle();
    if (error) fail(`${error.message} (did you run migration 028?)`);
    if (!company) fail("Merchant not found.");

    const off: Record<string, unknown> = {};
    if (!features.qr) off.qr_ordering = false;
    if (!features.tables) off.service_mode = "cafe";
    if (!features.duitnow_app) off.duitnow_in_app = false;
    if (Object.keys(off).length) await supabaseAdmin.from("businesses").update(off).eq("company_id", id);

    revalidatePath("/", "layout");
    await logActivity("merchant.plan", `${company.name}: plan set to ${plan}`, id);
    done(`${company.name}: ${plan === "custom" ? "Custom plan" : PLANS[plan as Exclude<Plan, "custom">].label} saved.`);
}
