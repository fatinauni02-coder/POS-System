import { Building2 } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { SubmitButton } from "@/components/submit-button";
import { Toast } from "@/components/toast";
import { getBusiness } from "@/lib/business";
import { TZ } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addOutlet, requireHq, saveOutletDetails, setOutletActive } from "./actions";

// "/merchant/outlets" = HQ's own outlets: add one (+ its manager login), rename, switch on / off. HQ only.
export default function OutletsPage({ searchParams }: PageProps<"/merchant/outlets">) {
    return (
        <Suspense fallback={<Loading />}>
            <Outlets searchParams={searchParams} />
        </Suspense>
    );
}

async function Outlets({ searchParams }: { searchParams: PageProps<"/merchant/outlets">["searchParams"] }) {
    await connection(); // always worked out when the page is opened (login, dates), never prerendered
    const hq = await requireHq();
    const params = await searchParams;
    const errorMessage = typeof params.error === "string" ? params.error : null;
    const savedMessage = typeof params.saved === "string" ? params.saved : null;

    const [here, { data: company }, { data: rows, error }] = await Promise.all([
        getBusiness(),
        supabaseAdmin.from("companies").select("name, hq_business_id").eq("id", hq.companyId).maybeSingle(),
        supabaseAdmin.from("businesses").select("id, name, outlet_label, address, phone, is_active, created_at, business_members(count)").eq("company_id", hq.companyId).order("created_at"),
    ]);
    if (error) return <p className="p-6 text-red-600">Error: {error.message}</p>;

    const outlets = (rows ?? []).map((b) => ({
        id: b.id as string,
        name: ((b.outlet_label as string | null) || b.name) as string, // the outlet: "HQ", "Johor Bharu"
        address: (b.address as string | null) ?? "",
        phone: (b.phone as string | null) ?? "",
        active: b.is_active !== false,
        since: new Date(b.created_at).toLocaleDateString("en-MY", { timeZone: TZ, dateStyle: "medium" }),
        logins: (b.business_members as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    }));

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                    <Building2 className="h-6 w-6 text-primary" />
                    Outlets
                </h1>
                <p className="text-sm text-ink-2">
                    {company?.name}: {outlets.length} outlet{outlets.length === 1 ? "" : "s"}. Every outlet uses HQ&apos;s business name, logo, tagline,
                    colours and menu; its outlet name, address and phone are set here. Orders, tables, stock and staff are per outlet. Switch outlets with the name in the top bar.
                </p>
            </div>

            {errorMessage && <Toast key={String(params.t)} kind="error" text={errorMessage} />}
            {savedMessage && <Toast key={String(params.t)} kind="msg" text={savedMessage} />}

            {/* ADD AN OUTLET */}
            <form action={addOutlet} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
                <h2 className="text-lg font-bold">Add an outlet</h2>
                <div className="grid gap-2 md:grid-cols-3">
                    <input name="label" required maxLength={60} placeholder="Outlet name, e.g. Johor Bahru" className={INPUT} />
                    <input name="address" maxLength={200} placeholder="Address (on receipts)" className={`${INPUT} md:col-span-2`} />
                    <input name="phone" type="tel" maxLength={30} placeholder="Phone" className={INPUT} />
                    <input
                        name="manager"
                        required
                        pattern="[a-zA-Z0-9._\-]{3,20}"
                        title="3–20 letters or numbers, no spaces"
                        placeholder="Manager user ID"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        className={INPUT}
                    />
                    <input name="password" type="password" required minLength={8} placeholder="Manager password (8+)" autoComplete="new-password" className={INPUT} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-ink-2">The manager signs in with this User ID. You get into the new outlet too.</p>
                    <SubmitButton className="h-11 shrink-0 rounded-xl bg-primary px-5 font-bold text-white">+ Add outlet</SubmitButton>
                </div>
            </form>

            {/* THE LIST */}
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                {outlets.map((o) => {
                    const isMaster = o.id === company?.hq_business_id;
                    const isHere = o.id === here?.id;
                    return (
                        <div key={o.id} className={`flex flex-col gap-3 border-b border-line p-4 last:border-b-0 ${o.active ? "" : "opacity-60"}`}>
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tint font-bold text-primary">
                                    {o.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                                        <span className="truncate">{o.name}</span>
                                        {isMaster && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">HQ menu</span>}
                                        {isHere && <span className="rounded-full bg-tint px-2 py-0.5 text-xs font-bold text-ink-2">You&apos;re here</span>}
                                    </p>
                                    <p className="text-sm text-ink-2">
                                        {o.logins} login{o.logins === 1 ? "" : "s"} · since {o.since}
                                    </p>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${o.active ? "bg-green-100 text-green-800" : "bg-tint text-ink-2"}`}>
                                    {o.active ? "Active" : "Off"}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pl-13">
                                <form action={saveOutletDetails} className="grid w-full gap-2 md:grid-cols-[1fr_2fr_1fr_auto]">
                                    <input type="hidden" name="id" value={o.id} />
                                    <input name="label" defaultValue={o.name} required maxLength={60} aria-label="Outlet name" className={SMALL} />
                                    <input name="address" defaultValue={o.address} maxLength={200} placeholder="Address" aria-label="Address" className={SMALL} />
                                    <input name="phone" type="tel" defaultValue={o.phone} maxLength={30} placeholder="Phone" aria-label="Phone" className={SMALL} />
                                    <SubmitButton className="h-10 rounded-xl bg-tint px-3 text-sm font-semibold">Save</SubmitButton>
                                </form>
                                {!isMaster && !isHere && (
                                    <form action={setOutletActive}>
                                        <input type="hidden" name="id" value={o.id} />
                                        <input type="hidden" name="active" value={o.active ? "0" : "1"} />
                                        <SubmitButton
                                            className={`h-10 rounded-xl px-3 text-sm font-semibold ${o.active ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}
                                        >
                                            {o.active ? "Switch off" : "Switch on"}
                                        </SubmitButton>
                                    </form>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="text-sm text-ink-2">Add staff for an outlet in Settings → Staff while you&apos;re in that outlet.</p>
        </div>
    );
}

const INPUT = "h-11 rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary";
const SMALL = "h-10 rounded-xl bg-tint px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary";
