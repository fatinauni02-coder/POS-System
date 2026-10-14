import "server-only"; // PIN checks must never run in the browser
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase-admin";

// We never save the PIN itself, only a "hash": a scrambled version that can't be turned back.
// salt = random text mixed in, so two shops with PIN 1234 get different hashes.
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

const MAX_TRIES = 5; // wrong PINs in a row before locking
const LOCK_SECONDS = 60; // how long the lock lasts

// the shop's PIN row: hash + wrong-try counter + lock time
async function readSecrets(businessId: string) {
    const { data } = await supabaseAdmin
        .from("business_secrets")
        .select("manager_pin_hash, pin_fails, pin_locked_until")
        .eq("business_id", businessId)
        .maybeSingle();
    return data;
}

// remember how many wrong tries, and until when it is locked
async function saveFails(businessId: string, fails: number, lockedUntil: string | null) {
    await supabaseAdmin
        .from("business_secrets")
        .update({ pin_fails: fails, pin_locked_until: lockedUntil })
        .eq("business_id", businessId);
}

export async function hasManagerPin(businessId: string) {
    const secrets = await readSecrets(businessId);
    return Boolean(secrets?.manager_pin_hash);
}

// save a new manager PIN (replaces the old one) and clear any lock
export async function setManagerPin(businessId: string, pin: string) {
    const { error } = await supabaseAdmin.from("business_secrets").upsert({
        business_id: businessId,
        manager_pin_hash: hashPin(pin),
        pin_fails: 0,
        pin_locked_until: null,
        updated_at: new Date().toISOString(),
    });
    return !error;
}

// null = PIN is right. Otherwise: the message to show.
// If the shop has no PIN yet, this PIN becomes the manager PIN.
export async function checkManagerPin(businessId: string, pin: string): Promise<string | null> {
    const secrets = await readSecrets(businessId);
    if (!secrets?.manager_pin_hash) {
        return (await setManagerPin(businessId, pin)) ? null : "Couldn't save the PIN.";
    }

    // still locked? say how many seconds are left
    const lockedUntil = secrets.pin_locked_until ? new Date(secrets.pin_locked_until).getTime() : 0;
    const secondsLeft = Math.ceil((lockedUntil - Date.now()) / 1000);
    if (secondsLeft > 0) return `Too many wrong PINs. Try again in ${secondsLeft} s.`;

    if (pinMatches(pin, secrets.manager_pin_hash)) {
        if (secrets.pin_fails > 0) await saveFails(businessId, 0, null); // right PIN: start counting again
        return null;
    }

    // wrong PIN: count it; the 5th wrong one locks
    const fails = secrets.pin_fails + 1;
    if (fails >= MAX_TRIES) {
        await saveFails(businessId, 0, new Date(Date.now() + LOCK_SECONDS * 1000).toISOString());
        return `Too many wrong PINs. Locked for ${LOCK_SECONDS} s.`;
    }
    await saveFails(businessId, fails, null);
    return `Wrong PIN. ${MAX_TRIES - fails} ${MAX_TRIES - fails === 1 ? "try" : "tries"} left.`;
}