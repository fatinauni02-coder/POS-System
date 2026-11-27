import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { Stat } from "@/components/stat";
import { addDays, dayInKL, TZ } from "@/lib/dates";
import { formatRM, toSen } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "./shops/actions";

// "/admin" = DASHBOARD: the whole platform at a glance (today, Malaysia time). Admin only.
// Sales = paid orders (status "completed"), the same rule as each shop's Report.
export default function AdminDashboard() {
    return (
        <Suspense fallback={<Loading />}>
            <Dashboard />
        </Suspense>
    );
}

async function Dashboard() {
    await connection(); // always worked out when the page is opened, never prerendered
    await requireAdmin();
    const today = dayInKL(new Date());

    const [{ data: companies }, { data: outlets }, { data: members }, { data: orders }] = await Promise.all([
        supabaseAdmin.from("companies").select("id, name, created_at").order("created_at", { ascending: false }),
        supabaseAdmin.from("businesses").select("id, company_id, is_active"),
        supabaseAdmin.from("business_members").select("user_id"),
        supabaseAdmin
            .from("orders")
            .select("business_id, status, total")
            .gte("created_at", `${today}T00:00:00+08:00`)
            .lt("created_at", `${addDays(today, 1)}T00:00:00+08:00`),
    ]);

    const paid = (orders ?? []).filter((o) => o.status === "completed");
    const salesSen = paid.reduce((s, o) => s + toSen(o.total), 0);
    const outletList = outlets ?? [];
    const activeOutlets = outletList.filter((o) => o.is_active !== false).length;
    const logins = new Set((members ?? []).map((m) => m.user_id)).size;

    // today, per merchant (busiest first)
    const byMerchant = (companies ?? [])
        .map((c) => {
            const ids = new Set(outletList.filter((o) => o.company_id === c.id).map((o) => o.id));
            const rows = paid.filter((o) => ids.has(o.business_id));
            return { id: c.id, name: c.name as string, outlets: ids.size, orders: rows.length, sen: rows.reduce((s, o) => s + toSen(o.total), 0) };
        })
        .sort((a, b) => b.sen - a.sen || a.name.localeCompare(b.name));

    const newest = (companies ?? []).slice(0, 5);

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-6">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                    <LayoutDashboard className="h-6 w-6 text-primary" />
                    Dashboard
                </h1>
                <p className="text-sm text-ink-2">
                    The whole platform today ({new Date(`${today}T12:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: TZ, dateStyle: "full" })}).
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="Merchants" value={String(companies?.length ?? 0)} />
                <Stat label="Outlets on" value={`${activeOutlets} / ${outletList.length}`} />
                <Stat label="Shop logins" value={String(logins)} />
                <Stat label="Orders today" value={String(paid.length)} />
                <Stat label="Sales today" value={formatRM(salesSen)} />
            </div>

            <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
                <section className="overflow-hidden rounded-2xl border border-line bg-surface">
                    <h2 className="border-b border-line bg-tint px-4 py-3 font-bold">Today by merchant</h2>
                    {byMerchant.length === 0 && <p className="p-4 text-sm text-ink-2">No merchants yet.</p>}
                    {byMerchant.map((m) => (
                        <div key={m.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">{m.name}</p>
                                <p className="text-xs text-ink-2">
                                    {m.outlets} outlet{m.outlets === 1 ? "" : "s"} · {m.orders} order{m.orders === 1 ? "" : "s"}
                                </p>
                            </div>
                            <span className="font-bold">{formatRM(m.sen)}</span>
                        </div>
                    ))}
                </section>

                <section className="overflow-hidden rounded-2xl border border-line bg-surface">
                    <h2 className="border-b border-line bg-tint px-4 py-3 font-bold">Newest merchants</h2>
                    {newest.map((c) => (
                        <div key={c.id} className="border-b border-line px-4 py-3 last:border-b-0">
                            <p className="truncate font-semibold">{c.name}</p>
                            <p className="text-xs text-ink-2">
                                Since {new Date(c.created_at).toLocaleDateString("en-MY", { timeZone: TZ, dateStyle: "medium" })}
                            </p>
                        </div>
                    ))}
                    <Link href="/admin/shops" className="block px-4 py-3 text-sm font-semibold text-primary hover:bg-tint">
                        All shops →
                    </Link>
                </section>
            </div>
        </div>
    );
}
