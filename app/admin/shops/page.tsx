import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { SubmitButton } from "@/components/submit-button";
import { Toast } from "@/components/toast";
import { TZ } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { FEATURES, PLANS, readFeatures, type Features } from "@/lib/plans";
import { addCompany, renameCompany, renameShop, requireAdmin, setPlan, setShopActive } from "./actions";

// "/admin/shops" = every MERCHANT (company / HQ) on the platform and its OUTLETS.
// Admin registers a merchant (+ first outlet + HQ login); the merchant's HQ adds more outlets itself
// in /merchant/outlets. Here: rename, switch an outlet on / off.
// Admin only (proxy.ts + requireAdmin). Needs migration 021.
export default function ShopsPage({ searchParams }: PageProps<"/admin/shops">) {
    return (
        <Suspense fallback={<Loading />}>
            <Shops searchParams={searchParams} />
        </Suspense>
    );
}

type Outlet = { id: string; name: string; slug: string; is_active: boolean; created_at: string; company_id: string | null; staff: number };
type Company = { id: string; name: string; created_at: string; hq: number; plan: string; features: Features };

async function Shops({ searchParams }: { searchParams: PageProps<"/admin/shops">["searchParams"] }) {
    await connection(); // always worked out when the page is opened (login, dates), never prerendered
    await requireAdmin();
    const params = await searchParams;
    const errorMessage = typeof params.error === "string" ? params.error : null;
    const savedMessage = typeof params.saved === "string" ? params.saved : null;

    const [{ data: companyRows, error: e1 }, { data: outletRows, error: e2 }] = await Promise.all([
        supabaseAdmin.from("companies").select("id, name, created_at, plan, features, company_members(count)").order("created_at"),
        supabaseAdmin.from("businesses").select("id, name, outlet_label, slug, is_active, created_at, company_id, business_members(count)").order("created_at"),
    ]);
    if (e1 || e2) return <p className="p-6 text-red-600">Error: {(e1 ?? e2)?.message} (did you run migration 021?)</p>;

    const count = (x: unknown) => (x as { count: number }[] | null)?.[0]?.count ?? 0;
    const companies: Company[] = (companyRows ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        created_at: c.created_at,
        hq: count(c.company_members),
        plan: (c.plan as string) ?? "premium",
        features: readFeatures(c.features),
    }));
    const outlets: Outlet[] = (outletRows ?? []).map((b) => ({
        id: b.id, name: b.outlet_label || b.name, slug: b.slug, is_active: b.is_active !== false, created_at: b.created_at, company_id: b.company_id, staff: count(b.business_members),
    }));
    const loose = outlets.filter((o) => !companies.some((c) => c.id === o.company_id));

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Shops</h1>
                <p className="text-sm text-ink-2">
                    Every merchant on Kopi Kira and its outlets. You register the merchant and its HQ login; HQ then adds its own outlets
                    (Outlets, in the merchant POS). Everyone signs in at /merchant/login with their User ID (unique across all shops).
                </p>
            </div>

            {errorMessage && <Toast key={String(params.t)} kind="error" text={errorMessage} />}
            {savedMessage && <Toast key={String(params.t)} kind="msg" text={savedMessage} />}

            {/* REGISTER A COMPANY */}
            <form action={addCompany} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
                <h2 className="text-lg font-bold">Register a merchant</h2>
                <div className="grid gap-2 md:grid-cols-2">
                    <input name="company_name" required maxLength={80} placeholder="Business name, e.g. Kedai Ali" className={`${INPUT} md:col-span-2`} />
                    <input name="outlet_name" maxLength={60} defaultValue="HQ" placeholder="First outlet name, e.g. HQ" className={`${INPUT} md:col-span-2`} />
                    <UserIdInput name="hq" placeholder="HQ user ID, e.g. ali" />
                    <PasswordInput name="hq_password" placeholder="HQ password (8+ characters)" />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-ink-2">The HQ login sees every outlet and adds new ones itself. The first outlet&apos;s menu is the HQ menu.</p>
                    <SubmitButton className="h-11 shrink-0 rounded-xl bg-primary px-5 font-bold text-white">+ Register</SubmitButton>
                </div>
            </form>

            {/* EACH COMPANY + ITS OUTLETS */}
            {companies.map((c) => {
                const mine = outlets.filter((o) => o.company_id === c.id);
                return (
                    <section key={c.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
                        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-tint p-4">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-lg font-bold">{c.name}</p>
                                <p className="text-sm text-ink-2">
                                    {mine.length} outlet{mine.length === 1 ? "" : "s"} · {c.hq} HQ login{c.hq === 1 ? "" : "s"} · since {when(c.created_at)}
                                </p>
                            </div>
                            <form action={renameCompany} className="flex gap-2">
                                <input type="hidden" name="id" value={c.id} />
                                <input name="name" defaultValue={c.name} required maxLength={80} className={SMALL_INPUT} />
                                <SubmitButton className="h-10 rounded-xl bg-surface px-3 text-sm font-semibold">Rename</SubmitButton>
                            </form>
                        </div>

                        <PlanRow c={c} />
                        {mine.map((o) => <OutletRow key={o.id} o={o} />)}

                    </section>
                );
            })}

            {/* shops from before migration 021 that have no company (should be none after it runs) */}
            {loose.length > 0 && (
                <section className="overflow-hidden rounded-2xl border border-line bg-surface">
                    <p className="border-b border-line bg-tint p-4 font-bold">No company yet</p>
                    {loose.map((o) => <OutletRow key={o.id} o={o} />)}
                </section>
            )}
        </div>
    );
}

// PLAN: Basic / Pro / Premium fill the ticks; Custom = your own ticks. One Save.
function PlanRow({ c }: { c: Company }) {
    return (
        <form action={setPlan} className="flex flex-col gap-3 border-b border-line p-4">
            <input type="hidden" name="company_id" value={c.id} />
            <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm font-bold">Plan</span>
                {(["basic", "pro", "premium", "custom"] as const).map((p) => (
                    <label key={p} className="cursor-pointer">
                        <input type="radio" name="plan" value={p} defaultChecked={c.plan === p} className="peer sr-only" />
                        <span className="block rounded-full bg-tint px-3 py-1.5 text-sm font-semibold peer-checked:bg-primary peer-checked:text-white">
                            {p === "custom" ? "Custom" : PLANS[p].label}
                        </span>
                    </label>
                ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
                {FEATURES.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name={`f_${f.key}`} defaultChecked={c.features[f.key]} className="h-4 w-4 accent-[var(--color-primary)]" />
                        {f.label}
                    </label>
                ))}
            </div>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-ink-2">
                    Basic = POS only · Pro = + QR, Tables, Stock · Premium = everything. The ticks only count for Custom.
                </p>
                <SubmitButton className="h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-bold text-white">Save plan</SubmitButton>
            </div>
        </form>
    );
}

function OutletRow({ o }: { o: Outlet }) {
    return (
        <div className={`flex flex-col gap-3 border-b border-line p-4 ${o.is_active ? "" : "opacity-60"}`}>
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tint font-bold text-primary">{o.name.charAt(0).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{o.name}</p>
                    <p className="text-sm text-ink-2">
                        Code <span className="font-mono font-semibold text-ink">{o.slug}</span> · {o.staff} login{o.staff === 1 ? "" : "s"} · since {when(o.created_at)}
                    </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${o.is_active ? "bg-green-100 text-green-800" : "bg-tint text-ink-2"}`}>
                    {o.is_active ? "Active" : "Off"}
                </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-13">
                <form action={renameShop} className="flex gap-2">
                    <input type="hidden" name="id" value={o.id} />
                    <input name="name" defaultValue={o.name} required maxLength={60} className={SMALL_INPUT} />
                    <SubmitButton className="h-10 rounded-xl bg-tint px-3 text-sm font-semibold">Rename</SubmitButton>
                </form>
                {/* read-only look inside the outlet, for helping on the phone */}
                <Link href={`/admin/shops/${o.id}`} className="flex h-10 items-center rounded-xl bg-tint px-3 text-sm font-semibold">
                    View
                </Link>
                <form action={setShopActive}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="active" value={o.is_active ? "0" : "1"} />
                    <SubmitButton className={`h-10 rounded-xl px-3 text-sm font-semibold ${o.is_active ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>
                        {o.is_active ? "Switch off" : "Switch on"}
                    </SubmitButton>
                </form>
            </div>
        </div>
    );
}

function UserIdInput({ name, placeholder }: { name: string; placeholder: string }) {
    return (
        <input
            name={name}
            required
            pattern="[a-zA-Z0-9._\-]{3,20}"
            title="3–20 letters or numbers, no spaces"
            placeholder={placeholder}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={INPUT}
        />
    );
}

function PasswordInput({ name, placeholder }: { name: string; placeholder: string }) {
    return <input name={name} type="password" required minLength={8} placeholder={placeholder} autoComplete="new-password" className={INPUT} />;
}

function when(iso: string) {
    return new Date(iso).toLocaleDateString("en-MY", { timeZone: TZ, dateStyle: "medium" });
}

const INPUT = "h-11 rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary";
const SMALL_INPUT = "h-10 w-48 rounded-xl bg-tint px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary";
