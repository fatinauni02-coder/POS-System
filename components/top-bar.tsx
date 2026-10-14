import { getBusiness } from "@/lib/business";

// TOP BAR — server component (async): reads the shop name + tagline from Supabase
export async function TopBar() {
  const business = await getBusiness();

  return (
    // h-16 = bar height (also change the fallback h-16 in layout.tsx so they match)
    // items-center = everything centred vertically; gap-3 = space between pieces
    // border-b = line under the bar; px-6 = space on the left and right
    <header className="flex h-16 print:hidden shrink-0 items-center gap-3 border-b border-line bg-surface px-6">
      {/* shop name: text-xl = size, tracking-tight = letters a bit closer */}
      <span className="text-xl font-bold tracking-tight">{business?.name ?? "POS"}</span>

      {/* tagline only if the shop has one; <>…</> groups 2 elements without adding a box */}
      {business?.tagline && (
        <>
          {/* the small dot between name and tagline */}
          <span className="h-1 w-1 rounded-full bg-ink-2" />
          {/* uppercase + tracking-wider = small spaced capitals */}
          <span className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">{business.tagline}</span>
        </>
      )}

      {/* ml-auto = push this to the far right (takes all free space on its left)
          rounded-full + px-3 py-1.5 = pill shape */}
      <span className="ml-auto rounded-full bg-tint px-3 py-1.5 text-sm font-semibold">Register #1</span>
    </header>
  );
}
