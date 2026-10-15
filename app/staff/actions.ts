"use server";

import { redirect } from "next/navigation";
import { getBusiness } from "@/lib/business";
import { requireManager, type Role } from "@/lib/staff";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toLoginEmail, USERNAME_PATTERN } from "@/lib/username";

// WHO MAY DO WHAT on the Staff page:
//   owner   → add / change / remove managers and staff (never another owner)
//   manager → add / remove staff only
//   nobody changes their own account here (so you can't lock yourself out)

const PAGE = "/staff";

// back to the page with a red message (a mistake the user can fix)
function fail(message: string): never {
    redirect(`${PAGE}?error=${encodeURIComponent(message)}`);
}

// back to the page with a green message
function done(message: string): never {
    redirect(`${PAGE}?saved=${encodeURIComponent(message)}`);
}

async function shopId() {
    const business = await getBusiness();
    if (!business) throw new Error("Shop not found");
    return business.id;
}

// the roles this person is allowed to give
function rolesFor(me: Role): Role[] {
    return me === "owner" ? ["staff", "manager"] : ["staff"];
}

function readRole(formData: FormData, me: Role): Role {
    const role = String(formData.get("role") ?? "") as Role;
    if (!rolesFor(me).includes(role)) fail("You can't give that role.");
    return role;
}

function readPassword(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    if (password.length < 8) fail("Password must be at least 8 characters.");
    return password;
}

// someone in THIS shop that the signed-in person is allowed to change
async function checkCanEdit(businessId: string, me: { id: string; role: Role }, userId: string) {
    if (userId === me.id) fail("You can't change your own account here.");

    const { data } = await supabaseAdmin
        .from("business_members")
        .select("role")
        .eq("business_id", businessId)
        .eq("user_id", userId)
        .maybeSingle();
    if (!data) fail("Staff member not found.");

    const role = data.role as Role;
    if (role === "owner") fail("Owners can't be changed here.");
    if (me.role !== "owner" && role !== "staff") fail("Only the owner can change managers.");
}

// ADD: create the login in Supabase Auth (username → hidden email), then link it to this shop with a role
export async function addStaff(formData: FormData) {
    const me = await requireManager();
    const businessId = await shopId();

    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) fail("Username: 3–20 letters or numbers (dot, dash, underscore allowed), no spaces.");
    const email = toLoginEmail(username); // "ali" → "ali@kopi-co.pos"
    const password = readPassword(formData);
    const role = readRole(formData, me.role);

    // email_confirm: true = can sign in straight away (no confirmation email)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) {
        fail(error?.code === "email_exists" ? `"${username}" is already taken.` : `Couldn't create the account: ${error?.message}`);
    }

    const { error: linkError } = await supabaseAdmin
        .from("business_members")
        .insert({ business_id: businessId, user_id: data.user.id, role });
    if (linkError) {
        await supabaseAdmin.auth.admin.deleteUser(data.user.id); // undo, so no half-made login is left behind
        throw new Error(linkError.message);
    }

    done(`${username} added as ${role}.`);
}

// CHANGE ROLE: staff ↔ manager (owner only, see rolesFor)
export async function setRole(formData: FormData) {
    const me = await requireManager();
    const businessId = await shopId();
    const userId = String(formData.get("user_id") ?? "");

    await checkCanEdit(businessId, me, userId);
    const role = readRole(formData, me.role);

    const { error } = await supabaseAdmin
        .from("business_members")
        .update({ role })
        .eq("business_id", businessId)
        .eq("user_id", userId);
    if (error) throw new Error(error.message);

    done("Role saved.");
}

// NEW PASSWORD: for when someone forgets theirs
export async function resetPassword(formData: FormData) {
    const me = await requireManager();
    const businessId = await shopId();
    const userId = String(formData.get("user_id") ?? "");

    await checkCanEdit(businessId, me, userId);
    const password = readPassword(formData);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (error) fail(`Couldn't change the password: ${error.message}`);

    done("Password changed. Tell them the new one.");
}

// REMOVE: unlink from the shop AND delete the login, so they can't sign in any more.
// Their old orders keep the cashier name (orders.cashier is a copy made at sale time).
export async function removeStaff(formData: FormData) {
    const me = await requireManager();
    const businessId = await shopId();
    const userId = String(formData.get("user_id") ?? "");

    await checkCanEdit(businessId, me, userId);

    const { error } = await supabaseAdmin
        .from("business_members")
        .delete()
        .eq("business_id", businessId)
        .eq("user_id", userId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.auth.admin.deleteUser(userId);

    done("Staff member removed.");
}
