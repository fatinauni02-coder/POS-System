"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkOwnPin, hasOwnPin, setOwnPin } from "@/lib/pin";
import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireManager } from "@/lib/staff";
import { HEX, THEME_PRESETS } from "@/lib/theme";

// which section was open ("?tab=…"), so we go back to the same one
const TABS = ["business", "appearance", "tax", "receipt", "service", "security"];

// go back to /settings (same section) with a red message
function fail(tabQ: string, message: string): never {
    redirect(`/settings?${tabQ}error=${encodeURIComponent(message)}&t=${Date.now()}`);
}

export async function saveSettings(formData: FormData) {
    const tab = String(formData.get("tab") ?? "");
    const tabQ = TABS.includes(tab) && tab !== "business" ? `tab=${tab}&` : "";
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) fail(tabQ, "Shop not found");

    // read a text box: trimmed, cut to a max length, empty → null
    const text = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max) || null;

    const name = text("name", 60);
    const sstRegistered = formData.get("sst_registered") === "on"; // a ticked checkbox sends "on"
    const sstRate = Number(formData.get("sst_rate"));
    const serviceMode = String(formData.get("service_mode") ?? "cafe");

    // check on the server (the browser's checks can be skipped)
    if (!name) fail(tabQ, "Shop name is required");
    if (!Number.isFinite(sstRate) || sstRate < 0 || sstRate > 20) fail(tabQ, "SST rate must be between 0 and 20");
    if (serviceMode !== "cafe" && serviceMode !== "restaurant") fail(tabQ, "Pick a service style");

    // APPEARANCE: 4 colours (#rrggbb) + which preset (or "custom")
    const colour = (key: string) => String(formData.get(`theme_${key}`) ?? "").toLowerCase();
    const theme = {
        preset: String(formData.get("theme_preset") ?? "custom"),
        primary: colour("primary"),
        background: colour("background"),
        surface: colour("surface"),
        text: colour("text"),
    };
    if (![theme.primary, theme.background, theme.surface, theme.text].every((c) => HEX.test(c))) fail(tabQ, "A colour isn't a valid #RRGGBB code");
    if (!(theme.preset in THEME_PRESETS)) theme.preset = "custom";

    const { error } = await supabaseAdmin
        .from("businesses")
        .update({
            name,
            tagline: text("tagline", 80),
            address: text("address", 200),
            phone: text("phone", 30),
            sst_registered: sstRegistered,
            sst_rate: sstRate,
            sst_reg_no: text("sst_reg_no", 40),
            receipt_footer: text("receipt_footer", 200),
            service_mode: serviceMode,
            theme,
            // what prints by itself after Pay / Send to kitchen (ticked box = "on")
            // which actions need a manager PIN (ticked = PIN needed)
            pin_for: {
                discount: formData.get("pin_discount") === "on",
                refund: formData.get("pin_refund") === "on",
                void: formData.get("pin_void") === "on",
            },
            auto_print: {
                receipt: formData.get("auto_receipt") === "on",
                bar: formData.get("auto_bar") === "on",
                kitchen: formData.get("auto_kitchen") === "on",
            },
        })
        .eq("id", business.id);

    if (error) fail(tabQ, error.message);
    revalidatePath("/", "layout"); // redraw EVERY page (incl. the top bar in the layout) with the new details
    redirect(`/settings?${tabQ}saved=1&t=${Date.now()}`); // reload the page with a green "Saved" message
}


// ---------- manager PIN ----------

// back to the PIN card (#pin) with a red message
function pinFail(message: string): never {
    redirect(`/settings?tab=security&pinError=${encodeURIComponent(message)}&t=${Date.now()}`);
}

export async function changePin(formData: FormData) {
    const me = await requireManager(); // owners/managers only — each sets THEIR OWN PIN
    const business = await getBusiness();
    if (!business) pinFail("Shop not found");

    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    const again = String(formData.get("again") ?? "");

    // changing an existing PIN needs the current one (so nobody else at the till can change it)
    if (await hasOwnPin(business.id, me.id)) {
        if (!(await checkOwnPin(business.id, me.id, current))) pinFail("Current PIN is wrong");
    }
    if (!/^\d{4,6}$/.test(next)) pinFail("New PIN must be 4 to 6 digits");
    if (next !== again) pinFail("The two new PINs are different");

    const problem = await setOwnPin(business.id, me.id, next);
    if (problem) pinFail(problem);
    redirect(`/settings?tab=security&pin=changed&t=${Date.now()}`);
}

// ---------- shop logo (Storage bucket "menu-photos", migration 013) ----------

const BUCKET = "menu-photos";

// delete a logo file — only if it's one of OUR uploads
async function deleteStored(url: string | null) {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    if (!url || !url.includes(marker)) return;
    await supabaseAdmin.storage.from(BUCKET).remove([decodeURIComponent(url.split(marker)[1])]);
}

// returns an error message, or null
export async function uploadLogo(formData: FormData): Promise<string | null> {
    await requireManager();
    const business = await getBusiness();
    if (!business) return "Shop not found";

    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) return "Pick a picture first";
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "Use a PNG, JPG or WebP picture";
    if (file.size > 1024 * 1024) return "Logo is too big (max 1 MB)";

    const path = `${business.id}/logo-${Date.now()}.png`;
    const { error: upError } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (upError) {
        console.error("logo upload failed:", upError);
        return "Couldn't upload the logo. Did you run migration 013?";
    }
    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { error } = await supabaseAdmin.from("businesses").update({ logo_url: url }).eq("id", business.id);
    if (error) return error.message;

    await deleteStored((business.logo_url as string | null) ?? null);
    revalidatePath("/", "layout"); // every page shows the new logo
    return null;
}

export async function removeLogo() {
    await requireManager();
    const business = await getBusiness();
    if (!business) return;
    await supabaseAdmin.from("businesses").update({ logo_url: null }).eq("id", business.id);
    await deleteStored((business.logo_url as string | null) ?? null);
    revalidatePath("/", "layout");
}
