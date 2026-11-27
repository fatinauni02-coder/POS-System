import { KeyRound } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { SubmitButton } from "@/components/submit-button";
import { Toast } from "@/components/toast";
import { TZ } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { displayName } from "@/lib/username";
import { requireAdmin } from "../shops/actions";
import { makeHq, resetPassword, setLocked } from "./actions";

// "/admin/logins" = every SHOP login on the platform: search, reset password, lock, change HQ. Admin only.
export default function LoginsPage({ searchParams }: PageProps<"/admin/logins">) {
    return (
        <Suspense fallback={<Loading />}>
            <Logins searchParams={searchParams} />
        </Suspense>
    );
}

type Membership = { companyId: string | null; company: string; outlet: string; role: string };
type Row = { id: string; userId: string; locked: boolean; lastSignIn: string | null; shops: Membership[]; hqOf: string[] };

async function Logins({ searchParams }: { searchParams: PageProps<"/admin/logins">["searchParams"] }) {
    await connection(); // always worked out when the page is opened, never prerendered
    await requireAdmin();
    const params = await searchParams;
    const q = (typeof params.q === "string" ? params.q : "").trim().toLowerCase();
    const errorMessage = typeof params.error === "string" ? params.error : null;
    const savedMessage = typeof params.saved === "string" ? params.saved : null;

    // all logins (a few pages of 1,000 is plenty for now), shop logins only
    const users: { id: string; email?: string; banned_until?: string | null; last_sign_in_at?: string | null }[] = [];
    for (let page = 1; page <= 5; page++) {
        const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        users.push(...(data?.users ?? []));
        if (!data || data.users.length < 1000) break;
    }
    const shopUsers = users.filter((u) => u.email?.endsWith(".pos"));

    const [{ data: members }, { data: hq }] = await Promise.all([
        supabaseAdmin.from("business_members").select("user_id, role, businesses(name, outlet_label, company_id)"),
        supabaseAdmin.from("company_members").select("user_id, company_id, companies(name)"),
    ]);

    const rows: Row[] = shopUsers
        .map((u) => ({
            id: u.id,
            userId: displayName(u.email ?? ""),
            locked: !!u.banned_until && new Date(u.banned_until) > new Date(),
            lastSignIn: u.last_sign_in_at ?? null,
            shops: (members ?? [])
                .filter((m) => m.user_id === u.id)
                .map((m) => {
                    const b = m.businesses as unknown as { name: string; outlet_label: string | null; company_id: string | null } | null;
                    return { companyId: b?.company_id ?? null, company: b?.name ?? "?", outlet: b?.outlet_label ?? "", role: m.role as string };
                }),
            hqOf: (hq ?? []).filter((h) => h.user_id === u.id).map((h) => (h.companies as unknown as { name: string } | null)?.name ?? "?"),
        }))
        .filter((r) => !q || r.userId.includes(q) || r.shops.some((s) => `${s.company} ${s.outlet}`.toLowerCase().includes(q)))
        .sort((a, b) => a.userId.localeCompare(b.userId));

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                    <KeyRound className="h-6 w-6 text-primary" />
                    Logins
                </h1>
                <p className="text-sm text-ink-2">
                    Every shop login. Reset a password when someone forgets it, lock a login, or make a login the HQ of its merchant (one HQ per merchant).
                </p>
            </div>

            {errorMessage && <Toast key={String(params.t)} kind="error" text={errorMessage} />}
            {savedMessage && <Toast key={String(params.t)} kind="msg" text={savedMessage} />}

            <form className="flex gap-2">
                <input name="q" defaultValue={q} placeholder="Search User ID, business or outlet" className={`${INPUT} flex-1`} />
                <button type="submit" className="h-11 rounded-xl bg-primary px-5 font-bold text-white">Search</button>
            </form>

            <p className="text-sm text-ink-2">
                {rows.length} login{rows.length === 1 ? "" : "s"}
                {q ? ` matching "${q}"` : ""}
            </p>

            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                {rows.map((r) => (
                    <div key={r.id} className={`flex flex-col gap-3 border-b border-line p-4 last:border-b-0 ${r.locked ? "opacity-60" : ""}`}>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-lg font-bold">{r.userId}</span>
                            {r.hqOf.map((c) => (
                                <span key={c} className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">
                                    HQ of {c}
                                </span>
                            ))}
                            {r.locked && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Locked</span>}
                            <span className="ml-auto text-xs text-ink-2">
                                {r.lastSignIn
                                    ? `Last sign-in ${new Date(r.lastSignIn).toLocaleString("en-MY", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" })}`
                                    : "Never signed in"}
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-2 text-sm">
                            {r.shops.length === 0 && <span className="text-ink-2">Not in any shop</span>}
                            {r.shops.map((s, i) => (
                                <span key={i} className="rounded-lg bg-tint px-2 py-1">
                                    {s.company}
                                    {s.outlet ? ` · ${s.outlet}` : ""} · <b>{s.role}</b>
                                </span>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <form action={resetPassword} className="flex gap-2">
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="q" value={q} />
                                <input name="password" type="password" required minLength={8} placeholder="New password (8+)" autoComplete="new-password" className={SMALL} />
                                <SubmitButton className="h-10 rounded-xl bg-tint px-3 text-sm font-semibold">Reset password</SubmitButton>
                            </form>
                            <form action={setLocked}>
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="q" value={q} />
                                <input type="hidden" name="lock" value={r.locked ? "0" : "1"} />
                                <SubmitButton className={`h-10 rounded-xl px-3 text-sm font-semibold ${r.locked ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
                                    {r.locked ? "Unlock" : "Lock"}
                                </SubmitButton>
                            </form>
                            {/* change HQ: owners/managers of a merchant that this login isn't HQ of yet */}
                            {[...new Map(r.shops.filter((s) => s.companyId && s.role !== "staff").map((s) => [s.companyId, s])).values()]
                                .filter((s) => !r.hqOf.includes(s.company))
                                .map((s) => (
                                    <form key={s.companyId} action={makeHq}>
                                        <input type="hidden" name="id" value={r.id} />
                                        <input type="hidden" name="q" value={q} />
                                        <input type="hidden" name="company_id" value={s.companyId ?? ""} />
                                        <SubmitButton className="h-10 rounded-xl bg-tint px-3 text-sm font-semibold">Make HQ of {s.company}</SubmitButton>
                                    </form>
                                ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

const INPUT = "h-11 rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary";
const SMALL = "h-10 w-48 rounded-xl bg-tint px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary";
