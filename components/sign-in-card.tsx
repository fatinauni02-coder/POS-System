import { ShieldCheck, Store } from "lucide-react";
import { connection } from "next/server";
import { signIn } from "@/app/login/actions";
import { SubmitButton } from "@/components/submit-button";

// ONE sign-in card, two portals:
//   /merchant/login → shops (owner, manager, staff)  → lands on /merchant
//   /admin/login    → you, the platform owner        → lands on /admin (ADMIN_EMAILS only)
// Same Supabase login underneath; only the look + where you land differ.
const PORTALS = {
    merchant: {
        badge: "Merchant Portal",
        title: "Merchant sign in",
        sub: "Your shop, your menu, your team.",
        Icon: Store,
    },
    admin: {
        badge: "Admin Portal",
        title: "Admin sign in",
        sub: "Manage every shop on the platform.",
        Icon: ShieldCheck,
    },
} as const;

const ERRORS: Record<string, string> = {
    "1": "Wrong user ID or password",
    off: "This shop is switched off. Please contact us.",
    noshop: "You were signed out: this login isn't in any open shop. Ask your manager.",
    admin: "This account can't open the Admin Portal",
};

export async function SignInCard({ portal, error }: { portal: keyof typeof PORTALS; error?: string }) {
    await connection(); // worked out when the page is opened (the footer's year), not at build time
    const p = PORTALS[portal];
    // the sign-in pages are the PLATFORM's (not one shop's): fixed Kopi Kira look + default colours
    const name = "Kopi Kira";

    return (
        <div className="flex w-full max-w-sm flex-col items-center gap-6">
            {/* brand above the card: K for merchants, shield for admin */}
            <div className="flex flex-col items-center gap-2">
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-card ${portal === "admin" ? "bg-ink" : "bg-primary"}`}>
                    {portal === "admin" ? <ShieldCheck className="h-8 w-8" /> : <span className="text-2xl font-bold">{name.charAt(0)}</span>}
                </div>
                <p className="text-xs font-bold tracking-[0.3em] text-ink-2 uppercase">{portal === "admin" ? `${name} admin` : `${name} POS`}</p>
            </div>

            <form action={signIn} className="flex w-full flex-col gap-4 rounded-3xl border border-line bg-surface p-8 shadow-card">
                <input type="hidden" name="portal" value={portal} />

                {/* small badge: which portal you're on */}
                <span className={`flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${portal === "admin" ? "bg-tint text-ink" : "bg-tint text-primary"}`}>
                    <p.Icon className="h-3.5 w-3.5" />
                    {p.badge}
                </span>

                <div>
                    <h1 className="text-2xl font-bold">{p.title}</h1>
                    <p className="mt-1 text-sm text-ink-2">{p.sub}</p>
                </div>

                {error && <p className="rounded-xl bg-red-50 p-3 text-center text-sm font-semibold text-red-700">{ERRORS[error] ?? ERRORS["1"]}</p>}

                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                    User ID
                    <input name="username" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="e.g. ali" className={INPUT} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                    Password
                    <input name="password" type="password" required autoComplete="current-password" className={INPUT} />
                </label>

                <SubmitButton className={`mt-2 h-12 rounded-2xl font-bold text-white ${portal === "admin" ? "bg-ink" : "bg-primary"}`}>Login</SubmitButton>
            </form>

            <p className="text-xs text-ink-2">© {new Date().getFullYear()} {name}</p>
        </div>
    );
}

const INPUT = "h-12 rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary";
