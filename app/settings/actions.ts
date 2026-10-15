"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkManagerPin, hasManagerPin, setManagerPin } from "@/lib/pin";
import { getBusiness } from "@/lib/business";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireManager } from "@/lib/staff";

// go back to /settings with a red message
function fail(message: string): never {
    redirect(`/settings?error=${encodeURIComponent(message)}`);
}

export async function saveSettings(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) fail("Shop not found");

    // read a text box: trimmed, cut to a max length, empty → null
    const text = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max) || null;

    const name = text("name", 60);
    const sstRegistered = formData.get("sst_registered") === "on"; // a ticked checkbox sends "on"
    const sstRate = Number(formData.get("sst_rate"));

    // check on the server (the browser's checks can be skipped)
    if (!name) fail("Shop name is required");
    if (!Number.isFinite(sstRate) || sstRate < 0 || sstRate > 20) fail("SST rate must be between 0 and 20");

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
        })
        .eq("id", business.id);

    if (error) fail(error.message);
    revalidatePath("/", "layout"); // redraw EVERY page (incl. the top bar in the layout) with the new details
    redirect("/settings?saved=1"); // reload the page with a green "Saved" message
}


// ---------- manager PIN ----------

// back to the PIN card (#pin) with a red message
function pinFail(message: string): never {
    redirect(`/settings?pinError=${encodeURIComponent(message)}#pin`);
}

export async function changePin(formData: FormData) {
    await requireManager(); // owners/managers only
    const business = await getBusiness();
    if (!business) pinFail("Shop not found");

    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    const again = String(formData.get("again") ?? "");

    // if a PIN exists, the current one must be right (so a cashier can't just change it)
    if (await hasManagerPin(business.id)) { 
        const pinError = await checkManagerPin(business.id, current);
        if (pinError) pinFail(pinError);
    }
    if (!/^\d{4,6}$/.test(next)) pinFail("New PIN must be 4 to 6 digits");
    if (next !== again) pinFail("The two new PINs are different");

    if (!(await setManagerPin(business.id, next))) pinFail("Couldn't save the PIN");
    redirect("/settings?pin=changed#pin");
}