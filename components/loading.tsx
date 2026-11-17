// LOADING: a spinning circle in the middle of the screen.
// min-h-[70dvh] = takes most of the screen height, so the circle sits in the middle (not at the top).
// Size: h-14 w-14 (bigger: h-16 w-16, smaller: h-10 w-10); border-[5px] = ring thickness.
// Used as the Suspense "fallback" while a page waits for Supabase.
// No hooks / no "use client" → works in server AND client components.
export function Loading({ text = "Loading…" }: { text?: string }) {
    return (
        <div role="status" className="flex min-h-[70dvh] items-center justify-center p-6">
            {/* a ring with one coloured side; animate-spin = turns forever */}
            <div className="h-14 w-14 animate-spin rounded-full border-[5px] border-tint border-t-primary" />
            {/* the text is only read out by screen readers (sr-only = invisible on screen) */}
            <span className="sr-only">{text}</span>
        </div>
    );
}
