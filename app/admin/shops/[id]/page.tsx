import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { Stat } from "@/components/stat";
import { addDays, dayInKL, TZ } from "@/lib/dates";
import { formatRM, toSen } from "@/lib/money";
import { FEATURES, readFeatures } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { displayName } from "@/lib/username";
import { requireAdmin } from "../actions";

// "/admin/shops/<outlet id>" = VIEW SHOP (support): a READ-ONLY look inside one outlet —
// its details, plan, staff, menu, tables and today's orders. Nothing here can be changed.
export default function ViewShopPage({ params }: PageProps<"/admin/shops/[id]">) {
    return (
        <Suspense fallback={<Loading />}>
            <ViewShop params={params} />
        </Suspense>
    );
}

async function ViewShop({ params }: { params: PageProps<"/admin/shops/[id]">["params"] }) {
    await connection(); // always worked out when the page is opened, never prerendered
    await requireAdmin();
    const { id } = await params;
    const today = dayInKL(new Date());

    const { data: shop, error: shopError } = await supabaseAdmin
        .from("businesses")
        .select("*, companies!company_id(name, plan, features, hq_business_id)")
        .eq("id", id)
        .maybeSingle();
    if (!shop) return <p className="p-6 text-red-600">Outlet not found{shopError ? `: ${shopError.message}` : "."}</p>;

    const [{ data: members }, { data: items }, { data: categories }, { data: tables }, { data: orders }] = await Promise.all([
        supabaseAdmin.from("business_members").select("user_id, role").eq("business_id", id),
        supabaseAdmin.from("menu_items").select("*").eq("business_id", id).order("name"),
        supabaseAdmin.from("categories").select("*").eq("business_id", id),
        supabaseAdmin.from("dining_tables").select("*").eq("business_id", id).order("label"),
        supabaseAdmin
            .from("orders")
            .select("*")
            .eq("business_id", id)
            .gte("created_at", `${today}T00:00:00+08:00`)
            .lt("created_at", `${addDays(today, 1)}T00:00:00+08:00`)
            .order("created_at", { ascending: false }),
    ]);

    // staff: User IDs from the logins
    const staff = await Promise.all(
        (members ?? []).map(async (m) => {
            const { data } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
            return { userId: displayName(data?.user?.email ?? "?"), role: m.role as string };
        }),
    );
    const roleOrder: Record<string, number> = { owner: 0, manager: 1, staff: 2 };
    staff.sort((a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3) || a.userId.localeCompare(b.userId));

    const company = shop.companies as unknown as { name: string; plan: string; features: unknown; hq_business_id: string | null } | null;
    const features = readFeatures(company?.features);
    const paid = (orders ?? []).filter((o) => o.status === "completed");
    const sales = paid.reduce((s, o) => s + toSen(o.total), 0);
    const catName = new Map((categories ?? []).map((c) => [c.id, c.name as string]));
    const soldOut = (items ?? []).filter((i) => !i.is_available).length;

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-6">
            <Link href="/admin/shops" className="flex w-fit items-center gap-1 text-sm font-semibold text-ink-2 hover:text-ink">
                <ArrowLeft className="h-4 w-4" /> Shops
            </Link>

            <div>
                <p className="flex items-center gap-2 text-xs font-bold tracking-wider text-ink-2 uppercase">
                    <Eye className="h-4 w-4" /> View only · nothing can be changed here
                </p>
                <h1 className="text-2xl font-bold tracking-tight">
                    {shop.name}
                    {shop.outlet_label && <span className="ml-2 text-base font-semibold text-ink-2">{shop.outlet_label}</span>}
                </h1>
                <p className="text-sm text-ink-2">
                    {[shop.address, shop.phone].filter(Boolean).join(" · ") || "No address or phone yet"}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Orders today" value={String(paid.length)} />
                <Stat label="Sales today" value={formatRM(sales)} />
                <Stat label="Menu items" value={`${items?.length ?? 0}${soldOut ? ` (${soldOut} off)` : ""}`} />
                <Stat label="Status" value={shop.is_active === false ? "Switched off" : "Active"} />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
                <Card title="Setup">
                    <Line label="Merchant" value={company?.name ?? "—"} />
                    <Line label="HQ menu outlet" value={company?.hq_business_id === shop.id ? "Yes (this one)" : "No"} />
                    <Line label="Plan" value={company?.plan ?? "—"} />
                    <Line label="Features" value={FEATURES.filter((f) => features[f.key]).map((f) => f.label).join(", ") || "POS only"} />
                    <Line label="Service style" value={shop.service_mode === "restaurant" ? "Restaurant (Tables)" : "Cafe"} />
                    <Line label="SST" value={shop.sst_registered ? `${shop.sst_rate}%` : "Not registered"} />
                    <Line label="Payments" value={((shop.payment_methods as string[] | null) ?? []).join(", ") || "—"} />
                    <Line label="QR ordering" value={shop.qr_ordering ? "On" : "Paused / off"} />
                </Card>

                <Card title={`Staff (${staff.length})`}>
                    {staff.length === 0 && <p className="text-sm text-ink-2">No logins.</p>}
                    {staff.map((p) => (
                        <Line key={p.userId} label={p.userId} value={p.role} />
                    ))}
                    <Link href={`/admin/logins?q=${encodeURIComponent(shop.outlet_label || shop.name)}`} className="pt-2 text-sm font-semibold text-primary">
                        Reset a password in Logins →
                    </Link>
                </Card>
            </div>

            <Card title={`Today's orders (${orders?.length ?? 0})`}>
                {(orders ?? []).length === 0 && <p className="text-sm text-ink-2">No orders yet today.</p>}
                {(orders ?? []).slice(0, 30).map((o) => (
                    <div key={o.id} className="flex items-center gap-3 border-b border-line py-2 text-sm last:border-b-0">
                        <span className="w-14 font-mono font-semibold">#{o.order_no ?? o.id}</span>
                        <span className="w-14 text-ink-2">{new Date(o.created_at).toLocaleTimeString("en-MY", { timeZone: TZ, timeStyle: "short" })}</span>
                        <span className="min-w-0 flex-1 truncate text-ink-2">
                            {o.order_type === "dine_in" ? `Dine-in${o.table_label ? ` · ${o.table_label}` : ""}` : "Takeaway"} · {o.payment_method ?? "unpaid"}
                        </span>
                        <span className={`text-xs font-bold uppercase ${o.status === "completed" ? "text-green-700" : "text-ink-2"}`}>{o.status}</span>
                        <span className="w-20 text-right font-semibold">{formatRM(toSen(o.total))}</span>
                    </div>
                ))}
            </Card>

            <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
                <Card title={`Menu (${items?.length ?? 0})`}>
                    {(items ?? []).length === 0 && <p className="text-sm text-ink-2">No menu yet.</p>}
                    {(items ?? []).map((i) => (
                        <div key={i.id} className="flex items-center gap-2 border-b border-line py-1.5 text-sm last:border-b-0">
                            <span className="min-w-0 flex-1 truncate">
                                {i.name}
                                <span className="text-ink-2"> · {catName.get(i.category_id) ?? "No category"}</span>
                            </span>
                            {i.hq_id != null && <span className="text-xs text-ink-3">From HQ</span>}
                            {i.hq_off ? (
                                <span className="text-xs font-bold text-ink-2">Unavailable (HQ)</span>
                            ) : (
                                !i.is_available && <span className="text-xs font-bold text-red-700">Sold out</span>
                            )}
                            <span className="w-20 text-right font-semibold">{formatRM(toSen(i.price))}</span>
                        </div>
                    ))}
                </Card>

                <Card title={`Tables (${tables?.length ?? 0})`}>
                    {(tables ?? []).length === 0 && <p className="text-sm text-ink-2">No tables.</p>}
                    <div className="flex flex-wrap gap-2">
                        {(tables ?? []).map((t) => (
                            <span key={t.id} className={`rounded-lg bg-tint px-2.5 py-1 text-sm font-semibold ${t.is_active ? "" : "opacity-50"}`}>
                                {t.label}
                            </span>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-2 font-bold">{title}</h2>
            {children}
        </section>
    );
}

function Line({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 py-1 text-sm">
            <span className="text-ink-2">{label}</span>
            <span className="text-right font-semibold">{value}</span>
        </div>
    );
}
