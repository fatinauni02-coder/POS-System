import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase with the PUBLIC key + the login cookie = "acting as the signed-in person"
export async function supabaseAuth() {
    const cookieStore = await cookies();
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
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