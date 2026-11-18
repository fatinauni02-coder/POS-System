import "server-only"; // PIN checks must never run in the browser
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { displayName } from "@/lib/username";

// We never save the PIN itself, only a "hash": a scrambled version that can't be turned back.
// salt = random text mixed in, so two people with PIN 1234 get different hashes.
function hashPin(pin: string) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(pin, salt, 32).toString("hex");
    return `${salt}:${hash}`;
}

// scramble the typed PIN the same way and compare
function pinMatches(pin: string, stored: string) {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const typed = scryptSync(pin, salt, 32);
    const saved = Buffer.from(hash, "hex");
    return typed.length === saved.length && timingSafeEqual(typed, saved);
}

const MAX_TRIES = 5; // wrong PINs in a row (per shop) before locking
const LOCK_SECONDS = 60; // how long the lock lasts

// EACH PERSON'S PIN (migration 015, table member_pins): only owners / managers count
async function managerPins(businessId: string) {
    const [{ data: pins }, { data: members }] = await Promise.all([
        supabaseAdmin.from("member_pins").select("user_id, pin_hash").eq("business_id", businessId),
        supabaseAdmin.from("business_members").select("user_id, role").eq("business_id", businessId).in("role", ["owner", "manager"]),
    ]);
    const managers = new Set((members ?? []).map((m) => m.user_id));
    return (pins ?? []).filter((p) => managers.has(p.user_id));
}

// the OLD shop PIN + the wrong-try counter + lock time (business_secrets)
async function readSecrets(businessId: string) {
    const { data } = await supabaseAdmin
        .from("business_secrets")
        .select("manager_pin_hash, pin_fails, pin_locked_until")
        .eq("business_id", businessId)
        .maybeSingle();
    return data;
}

async function saveFails(businessId: string, fails: number, lockedUntil: string | null) {
    await supabaseAdmin.from("business_secrets").upsert({ business_id: businessId, pin_fails: fails, pin_locked_until: lockedUntil });
}

// the username shown for a login ("ali")
async function nameOf(userId: string) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return displayName(data.user?.email ?? "manager");
}

// can anyone approve here? (someone has their own PIN, or the old shop PIN is still there)
export async function hasManagerPin(businessId: string) {
    if ((await managerPins(businessId)).length > 0) return true;
    return Boolean((await readSecrets(businessId))?.manager_pin_hash);
}

export type PinCheck = { ok: true; by: string } | { ok: false; message: string };

// A manager types THEIR PIN to approve a discount / refund / void.
// ok → by = who it belongs to (saved with the discount / refund / void).
export async function checkManagerPin(businessId: string, pin: string): Promise<PinCheck> {
    const secrets = await readSecrets(businessId);

    // still locked? say how many seconds are left
    const lockedUntil = secrets?.pin_locked_until ? new Date(secrets.pin_locked_until).getTime() : 0;
    const secondsLeft = Math.ceil((lockedUntil - Date.now()) / 1000);
    if (secondsLeft > 0) return { ok: false, message: `Too many wrong PINs. Try again in ${secondsLeft} s.` };

    const pins = await managerPins(businessId);
    let by: string | null = null;
    if (pins.length > 0) {
        // whose PIN is it? (PINs are unique per shop — see setOwnPin)
        const match = pins.find((p) => pinMatches(pin, p.pin_hash));
        if (match) by = await nameOf(match.user_id);
    } else if (secrets?.manager_pin_hash) {
        // nobody has their own PIN yet → the old shop PIN still works
        if (pinMatches(pin, secrets.manager_pin_hash)) by = "manager";
    } else {
        return { ok: false, message: "No manager PIN yet. A manager sets one in Settings → Manager PIN." };
    }

    if (by) {
        if ((secrets?.pin_fails ?? 0) > 0) await saveFails(businessId, 0, null); // right PIN: start counting again
        return { ok: true, by };
    }

    // wrong PIN: count it; the 5th wrong one locks
    const fails = (secrets?.pin_fails ?? 0) + 1;
    if (fails >= MAX_TRIES) {
        await saveFails(businessId, 0, new Date(Date.now() + LOCK_SECONDS * 1000).toISOString());
        return { ok: false, message: `Too many wrong PINs. Locked for ${LOCK_SECONDS} s.` };
    }
    await saveFails(businessId, fails, null);
    return { ok: false, message: `Wrong PIN. ${MAX_TRIES - fails} ${MAX_TRIES - fails === 1 ? "try" : "tries"} left.` };
}

// ---------- my own PIN (Settings → Manager PIN) ----------

export async function hasOwnPin(businessId: string, userId: string) {
    const { data } = await supabaseAdmin.from("member_pins").select("user_id").eq("business_id", businessId).eq("user_id", userId).maybeSingle();
    return Boolean(data);
}

// is this the right CURRENT pin for this person? (to change it)
export async function checkOwnPin(businessId: string, userId: string, pin: string) {
    const { data } = await supabaseAdmin.from("member_pins").select("pin_hash").eq("business_id", businessId).eq("user_id", userId).maybeSingle();
    return Boolean(data && pinMatches(pin, data.pin_hash));
}

// save / replace this person's PIN. Returns an error message, or null.
// Two managers can't have the same PIN, or we wouldn't know who approved.
export async function setOwnPin(businessId: string, userId: string, pin: string): Promise<string | null> {
    const others = (await managerPins(businessId)).filter((p) => p.user_id !== userId);
    if (others.some((p) => pinMatches(pin, p.pin_hash))) return "Someone else uses that PIN. Pick a different one.";

    const { error } = await supabaseAdmin
        .from("member_pins")
        .upsert({ business_id: businessId, user_id: userId, pin_hash: hashPin(pin), updated_at: new Date().toISOString() });
    if (error) return "Couldn't save the PIN. Did you run migration 015?";
    await saveFails(businessId, 0, null);
    return null;
}

// owner removes someone's PIN (e.g. they forgot it) — Staff page
export async function clearOwnPin(businessId: string, userId: string) {
    await supabaseAdmin.from("member_pins").delete().eq("business_id", businessId).eq("user_id", userId);
}
