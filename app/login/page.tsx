import { Suspense } from "react";
import { signIn } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { getBusiness } from "@/lib/business";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas p-4">
            <Suspense>
                <LoginForm searchParams={searchParams} />
            </Suspense>
        </div>
    );
}

async function LoginForm({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
    const { error } = await searchParams;
    // shop logo + name from Settings → Business (no logo yet → the first letter of the name)
    const business = await getBusiness();
    const name = business?.name ?? "Cafe";
    const logo = (business?.logo_url as string | null) ?? null;

    return (
        <form action={signIn} className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-line bg-surface p-8">
            {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={name} className="mx-auto h-16 w-16 rounded-2xl object-cover" />
            ) : (
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-white">{name.charAt(0).toUpperCase()}</div>
            )}
            <div className="text-center">
                <h1 className="text-2xl font-bold">Sign in</h1>
                <p className="mt-1 text-sm font-semibold opacity-60">{name} POS</p>
            </div>

            {error && <p className="rounded-xl bg-red-50 p-3 text-center text-sm font-semibold text-red-700">Wrong username or password</p>}

            <input name="username" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Username" className={INPUT} />
            <input name="password" type="password" required autoComplete="current-password" placeholder="Password" className={INPUT} />
            <SubmitButton className="h-12 rounded-2xl bg-primary font-bold text-white">Sign in</SubmitButton>
        </form>
    );
}

const INPUT = "h-12 rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary";