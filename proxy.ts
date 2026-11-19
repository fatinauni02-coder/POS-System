import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// runs before EVERY page and Server Action:
// not signed in → go to /login. Signed in and on /login → go to the Order screen.
// Exception: the customer QR ordering pages ("/order/…") need no login.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      // Supabase may renew the login; pass the new cookie on to the page AND the browser
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() checks the login cookie's signature right here (no trip to Supabase on every click,
  // unlike getUser()). It also refreshes an expired login via setAll above.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;
  const path = request.nextUrl.pathname;
  const onLogin = path === "/login";

  // CUSTOMER QR PAGES: open to everyone, no login. ONLY "/order/…" — every other address stays staff-only.
  if (path === "/order" || path.startsWith("/order/")) return response;

    // CUSTOMER APP API: open to the app, no staff login (each API checks what it needs itself)
  if (path.startsWith("/api/v1/")) return response;

  if (!user && !onLogin) return NextResponse.redirect(new URL("/login", request.url));
  if (user && onLogin) return NextResponse.redirect(new URL("/", request.url));
  return response;
}

// every address except Next.js files, the favicon, and the app manifest + icons
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-|apple-icon).*)"],
};