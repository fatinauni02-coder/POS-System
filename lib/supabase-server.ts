import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { authCookieOptions, PORTAL_HEADER, type Portal } from "@/lib/portal";

// Supabase with the PUBLIC key + the login cookie = "acting as the signed-in person"
// Which login: the portal this request is in (proxy.ts sets the header): /admin… = the admin login, else the shop login
export async function supabaseAuth() {
    const cookieStore = await cookies();
    const portal: Portal = (await headers()).get(PORTAL_HEADER) === "admin" ? "admin" : "merchant";
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookieOptions: authCookieOptions(portal),
        cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: (list) => {
                // pages can't set cookies (only actions can) — then just skip it, proxy.ts keeps it fresh
                try {
                    list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
                } catch {}
            },
        },
    });
}
