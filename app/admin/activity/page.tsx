import { History } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { TZ } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { displayName } from "@/lib/username";
import { requireAdmin } from "../shops/actions";

// "/admin/activity" = the latest 300 important changes on the platform (migration 029). Admin only.
export default function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
    return (
        <Suspense fallback={<Loading />}>
            <Activity searchParams={searchParams} />
        </Suspense>
    );
}

async function Activity({ searchParams }: { searchParams: PageProps<"/admin/activity">["searchParams"] }) {
    await connection(); // always worked out when the page is opened, never prerendered
    await requireAdmin();
    const params = await searchParams;
    const q = (typeof params.q === "string" ? params.q : "").trim();

    let query = supabaseAdmin
        .from("activity_log")
        .select("id, at, actor, portal, action, summary, companies(name)")
        .order("at", { ascending: false })
        .limit(300);
    if (q) query = query.or(`summary.ilike.%${q.replace(/[%,()]/g, "")}%,actor.ilike.%${q.replace(/[%,()]/g, "")}%`);
    const { data, error } = await query;
    if (error) return <p className="p-6 text-red-600">Error: {error.message} (did you run migration 029?)</p>;

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                    <History className="h-6 w-6 text-primary" />
                    Activity
                </h1>
                <p className="text-sm text-ink-2">
                    Who changed what, newest first: merchants registered, plans, outlets switched on/off, password resets, HQ changes, menu pushes
                    and pauses.
                </p>
            </div>

            <form className="flex gap-2">
                <input name="q" defaultValue={q} placeholder="Search, e.g. a User ID, merchant or 'password'" className={INPUT} />
                <button type="submit" className="h-11 rounded-xl bg-primary px-5 font-bold text-white">Search</button>
            </form>

            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                {(data ?? []).length === 0 && <p className="p-4 text-sm text-ink-2">Nothing yet.</p>}
                {(data ?? []).map((a) => (
                    <div key={a.id} className="flex flex-col gap-1 border-b border-line px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4">
                        <span className="w-40 shrink-0 text-xs text-ink-2">
                            {new Date(a.at).toLocaleString("en-MY", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" })}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                            {a.summary}
                            {(a.companies as unknown as { name: string } | null)?.name && (
                                <span className="text-ink-2"> · {(a.companies as unknown as { name: string }).name}</span>
                            )}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${a.portal === "admin" ? "bg-ink text-white" : "bg-tint text-ink-2"}`}>
                            {a.portal === "admin" ? "Admin" : "HQ"} · {displayName(String(a.actor)).replace(/@.*$/, "")}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

const INPUT = "h-11 flex-1 rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary";
