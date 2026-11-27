import { Building2, Send } from "lucide-react";
import { pushHqMenu } from "@/components/hq-actions";
import { SubmitButton } from "@/components/submit-button";
import { getBusiness } from "@/lib/business";
import { TZ } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseAuth } from "@/lib/supabase-server";

// MENU PAGE strip, HQ users only:
//   on the master-menu outlet → "Push menu to outlets" (+ when it was last pushed)
//   on another outlet         → where its menu comes from
// Everyone else sees nothing.
export async function HqMenuStrip({ area, pushed, error }: { area: "/merchant" | "/admin"; pushed?: string; error?: string }) {
    const business = await getBusiness();
    if (!business?.company_id) return null;

    const supabase = await supabaseAuth();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;
    if (!userId) return null;

    const [{ data: hq }, { data: company }, { count: outlets }] = await Promise.all([
        supabaseAdmin.from("company_members").select("role").eq("company_id", business.company_id).eq("user_id", userId).maybeSingle(),
        supabaseAdmin.from("companies").select("name, hq_business_id, menu_pushed_at, businesses!companies_hq_business_id_fkey(name)").eq("id", business.company_id).maybeSingle(),
        supabaseAdmin.from("businesses").select("id", { count: "exact", head: true }).eq("company_id", business.company_id),
    ]);
    if (!hq || !company) return null;

    const others = Math.max((outlets ?? 1) - 1, 0);
    const master = company.businesses as unknown as { name: string } | null;

    if (company.hq_business_id !== business.id) {
        return (
            <div className="flex items-center gap-2 border-b border-line bg-tint px-4 py-2.5 text-sm lg:px-6">
                <Building2 className="h-4 w-4 shrink-0 text-ink-2" />
                <span>
                    This outlet&apos;s menu comes from HQ (<b>{master?.name ?? "the HQ outlet"}</b>). Switch to it in the top bar to change and push the menu.
                </span>
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-tint px-4 py-3 lg:px-6">
            <Building2 className="h-5 w-5 shrink-0 text-primary" />
            <div className="mr-auto text-sm">
                <p className="font-bold">HQ menu for {company.name}</p>
                <p className="text-ink-2">
                    {others === 0
                        ? "No other outlets yet: add one in Admin → Shops."
                        : `Used by ${others} other outlet${others === 1 ? "" : "s"}. ` +
                          (company.menu_pushed_at
                              ? `Last pushed ${new Date(company.menu_pushed_at).toLocaleString("en-MY", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" })}.`
                              : "Not pushed yet.")}
                </p>
                {pushed && <p className="font-semibold text-green-700">Menu pushed to {pushed} outlet{pushed === "1" ? "" : "s"} ✓</p>}
                {error && <p className="font-semibold text-red-700">{error}</p>}
            </div>
            {others > 0 && (
                <form action={pushHqMenu}>
                    <input type="hidden" name="area" value={area} />
                    <SubmitButton className="flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-bold text-white">
                        <Send className="h-4 w-4" />
                        Push menu to outlets
                    </SubmitButton>
                </form>
            )}
        </div>
    );
}
