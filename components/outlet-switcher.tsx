import { Check, ChevronDown } from "lucide-react";
import { switchOutlet } from "@/app/login/actions";
import type { MyOutlet } from "@/lib/outlets";

// TOP BAR shop name → a dropdown when you can open more than one outlet (HQ).
// <details> opens/closes by itself (no JavaScript needed); each outlet = a small form.
export function OutletSwitcher({ currentId, currentName, outlets }: { currentId: string; currentName: string; outlets: MyOutlet[] }) {
    return (
        <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-xl px-2 py-1 text-xl font-bold tracking-tight hover:bg-tint">
                {currentName}
                <ChevronDown className="h-4 w-4 text-ink-2 transition group-open:rotate-180" />
            </summary>

            <div className="absolute top-full left-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-card">
                <p className="px-3 pt-2 pb-1 text-xs font-bold tracking-wider text-ink-2 uppercase">Switch outlet</p>
                {outlets.map((o) =>
                    o.active ? (
                        <form key={o.id} action={switchOutlet}>
                            <input type="hidden" name="id" value={o.id} />
                            <button
                                type="submit"
                                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-tint ${o.id === currentId ? "font-bold" : "font-semibold"}`}
                            >
                                <span className="w-4 shrink-0">{o.id === currentId && <Check className="h-4 w-4 text-primary" />}</span>
                                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                            </button>
                        </form>
                    ) : (
                        // switched off in /admin/shops: shown, can't be picked
                        <div key={o.id} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-ink-2 opacity-60">
                            <span className="w-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{o.label}</span>
                            <span className="text-xs">(off)</span>
                        </div>
                    ),
                )}
            </div>
        </details>
    );
}
