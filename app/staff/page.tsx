import { Suspense } from "react";
import { getBusiness } from "@/lib/business";
import { TZ } from "@/lib/dates";
import { getStaff, type Role } from "@/lib/staff";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { displayName } from "@/lib/username";
import { addStaff, resetPassword, setRole } from "./actions";
import { RemoveButton } from "./remove-button";

// "/staff" = who can sign in to this shop, and what they may do
export default function StaffPage({ searchParams }: PageProps<"/staff">) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Staff searchParams={searchParams} />
        </Suspense>
    );
}

const ROLE_NAMES: Record<Role, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };
const ROLE_ORDER: Record<Role, number> = { owner: 0, manager: 1, staff: 2 };
const ROLE_BADGE: Record<Role, string> = {
    owner: "bg-primary text-white",
    manager: "bg-amber-100 text-amber-800",
    staff: "bg-tint text-ink-2",
};

type Person = { id: string; role: Role; name: string; lastSignIn: string | null };

async function Staff({ searchParams }: { searchParams: PageProps<"/staff">["searchParams"] }) {
    const params = await searchParams;
    const errorMessage = typeof params.error === "string" ? params.error : null;
    const savedMessage = typeof params.saved === "string" ? params.saved : null;

    const me = await getStaff();
    const business = await getBusiness();
    if (!me || !business) return <p className="p-6 text-red-600">Shop not found</p>;

    // 1) who belongs to this shop (our table)
    const { data: rows, error } = await supabaseAdmin
        .from("business_members")
        .select("user_id, role")
        .eq("business_id", business.id);
    if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

    // 2) their emails live in Supabase Auth, not in our table → ask for each person (a cafe has only a few)
    const people: Person[] = await Promise.all(
        (rows ?? []).map(async (r) => {
            const { data } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
            return {
                id: r.user_id,
                role: r.role as Role,
                name: data.user?.email ? displayName(data.user.email) : "(login deleted)",
                lastSignIn: data.user?.last_sign_in_at ?? null,
            };
        }),
    );
    people.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));

    // what the signed-in person may do (the actions check all of this again on the server)
    const canGive: Role[] = me.role === "owner" ? ["staff", "manager"] : ["staff"];
    const canEdit = (p: Person) => p.id !== me.id && p.role !== "owner" && (me.role === "owner" || p.role === "staff");

    return (
        <div className="flex max-w-4xl flex-col gap-5 p-6">
            {/* HEADER */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
                <p className="text-sm text-ink-2">
                    Everyone here signs in with their own username and password. Staff can take orders and see History; managers can also
                    change the Menu, Stock, Settings and see the Report.
                </p>
            </div>

            {/* MESSAGES from the last action */}
            {errorMessage && <p className="rounded-2xl bg-red-50 p-4 font-semibold text-red-700">{errorMessage}</p>}
            {savedMessage && <p className="rounded-2xl bg-green-50 p-4 font-semibold text-green-800">{savedMessage}</p>}

            {/* ADD SOMEONE */}
            <form action={addStaff} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
                <h2 className="text-lg font-bold">Add staff</h2>
                <div className="grid gap-2 lg:grid-cols-[1fr_1fr_auto_auto]">
                    <input
                        name="username"
                        type="text"
                        required
                        pattern="[a-zA-Z0-9._\-]{3,20}"
                        title="3–20 letters or numbers, no spaces"
                        placeholder="Username, e.g. ali"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        className={INPUT}
                    />
                    <input
                        name="password"
                        type="password"
                        required
                        minLength={8}
                        placeholder="Password (8+ characters)"
                        autoComplete="new-password"
                        className={INPUT}
                    />
                    <RoleSelect roles={canGive} />
                    <button className="h-11 rounded-xl bg-primary px-5 font-bold text-white">+ Add</button>
                </div>
                <p className="text-sm text-ink-2">
                    Usernames are 3–20 letters or numbers, no spaces. Give them the password yourself.
                </p>
            </form>

            {/* THE LIST */}
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                {people.map((p) => (
                    <div key={p.id} className="flex flex-col gap-3 border-b border-line p-4 last:border-b-0">
                        {/* who: initial · username · last sign-in · role badge */}
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint font-bold text-primary">
                                {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">
                                    {p.name}
                                    {p.id === me.id && <span className="ml-2 text-sm font-normal text-ink-2">(you)</span>}
                                </p>
                                <p className="text-sm text-ink-2">Last sign-in: {formatWhen(p.lastSignIn)}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${ROLE_BADGE[p.role]}`}>{ROLE_NAMES[p.role]}</span>
                        </div>

                        {/* what you can do to them (only shown if you're allowed) */}
                        {canEdit(p) && (
                            <div className="flex flex-wrap items-center gap-2 pl-13">
                                {canGive.length > 1 && (
                                    <form action={setRole} className="flex gap-2">
                                        <input type="hidden" name="user_id" value={p.id} />
                                        <RoleSelect roles={canGive} value={p.role} small />
                                        <button className="h-10 rounded-xl bg-tint px-3 text-sm font-semibold">Save role</button>
                                    </form>
                                )}
                                <form action={resetPassword} className="flex gap-2">
                                    <input type="hidden" name="user_id" value={p.id} />
                                    <input
                                        name="password"
                                        type="password"
                                        required
                                        minLength={8}
                                        placeholder="New password"
                                        autoComplete="new-password"
                                        className="h-10 w-40 rounded-xl bg-tint px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary"
                                    />
                                    <button className="h-10 rounded-xl bg-tint px-3 text-sm font-semibold">Reset password</button>
                                </form>
                                <RemoveButton userId={p.id} name={p.name} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

const INPUT = "h-11 rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary";

// role dropdown: the add form (big) and each row (small)
function RoleSelect({ roles, value, small = false }: { roles: Role[]; value?: Role; small?: boolean }) {
    return (
        <select
            name="role"
            defaultValue={value ?? roles[0]}
            className={`${small ? "h-10 text-sm" : "h-11"} rounded-xl bg-tint px-3 font-semibold outline-none focus:ring-2 focus:ring-primary`}
        >
            {roles.map((r) => (
                <option key={r} value={r}>
                    {ROLE_NAMES[r]}
                </option>
            ))}
        </select>
    );
}

// "15 Oct 2026, 4:12 pm" in Malaysia time, or "Never"
function formatWhen(iso: string | null) {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString("en-MY", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
}
