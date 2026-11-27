import { getBusiness } from "@/lib/business";
import { signOut } from "@/app/login/actions";
import { getStaff } from "@/lib/staff";
import { SubmitButton } from "@/components/submit-button";
import { OutletSwitcher } from "@/components/outlet-switcher";
import { myOutlets } from "@/lib/outlets";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PORTAL_HEADER } from "@/lib/portal";

// TOP BAR — server component (async): reads the shop name + tagline from Supabase
export async function TopBar() {
  const business = await getBusiness();
  const staff = await getStaff();
  const outlets = await myOutlets(); // more than one (HQ) → the name becomes a dropdown
  const inAdmin = (await headers()).get(PORTAL_HEADER) === "admin"; // Admin Portal: the platform's name, not a shop's
  // signed in on the shop side but not in any (switched-on) shop → sign out by itself
  if (!inAdmin && !business) redirect("/merchant/logout");
  // the grey outlet name ("HQ", "Johor Bharu") only when the company has more than one outlet
  const { count: companyOutlets } = business?.company_id
    ? await supabaseAdmin.from("businesses").select("id", { count: "exact", head: true }).eq("company_id", business.company_id)
    : { count: 0 };

  return (
    // h-16 = bar height (also change the fallback h-16 in layout.tsx so they match)
    // items-center = everything centred vertically; gap-3 = space between pieces
    // border-b = line under the bar; px-6 = space on the left and right
    <header className="flex h-16 print:hidden shrink-0 items-center gap-3 border-b border-line bg-surface px-6">
      {/* shop name (HQ: a dropdown to switch outlet): text-xl = size, tracking-tight = letters a bit closer */}
      {inAdmin ? (
        <span className="text-xl font-bold tracking-tight">Kopi Kira</span>
      ) : business && outlets.length > 1 ? (
        <OutletSwitcher currentId={business.id} currentName={business.name} outlets={outlets} />
      ) : (
        <span className="text-xl font-bold tracking-tight">{business?.name ?? "POS"}</span>
      )}

      {/* which outlet: "HQ", "Johor Bharu"… small and grey next to the business name (hidden for a one-shop merchant) */}
      {inAdmin && <span className="text-sm font-semibold text-ink-2">Admin</span>}
      {!inAdmin && business?.outlet_label && (companyOutlets ?? 0) > 1 && <span className="text-sm font-semibold text-ink-2">{business.outlet_label}</span>}

      {/* tagline only if the shop has one; <>…</> groups 2 elements without adding a box */}
      {business?.tagline && (
        <>
          {/* the small dot between name and tagline */}
          <span className="h-1 w-1 rounded-full bg-ink-2" />
          {/* uppercase + tracking-wider = small spaced capitals */}
          <span className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">{business.tagline}</span>
        </>
      )}

      {/* who's signed in + Sign out — ALWAYS there, also for an admin or a login with no shop (else you'd be stuck) */}
      <div className="ml-auto flex items-center gap-2">
        <span className="rounded-full bg-tint px-3 py-1.5 text-sm font-semibold">
          {staff ? `${staff.name} · ${staff.role}` : inAdmin ? "Admin" : "Not in any shop"}
        </span>
        <form action={signOut}>
          <SubmitButton className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-2 hover:bg-tint">Sign out</SubmitButton>
        </form>
      </div>
    </header>
  );
}
