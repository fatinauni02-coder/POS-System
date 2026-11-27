import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/admins";
import { authCookieOptions, PORTAL_HEADER, portalOf } from "@/lib/portal";

// runs before EVERY page and Server Action:
// not signed in → /merchant/login (or /admin/login for admin pages). Signed in on a sign-in page → straight in.
// Exception: the customer QR ordering pages ("/order/…") and the app API need no login.
export async function proxy(request: NextRequest) {
  // which portal (/admin… or /merchant…) → which login cookie; pages and actions read it from PORTAL_HEADER
  const portal = portalOf(request.nextUrl.pathname);
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set(PORTAL_HEADER, portal);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: authCookieOptions(portal),
    cookies: {
      getAll: () => request.cookies.getAll(),
      // Supabase may renew the login; pass the new cookie on to the page AND the browser
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() checks the login cookie's signature right here (no trip to Supabase on every click,
  // unlike getUser()). It also refreshes an expired login via setAll above.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;
  const path = request.nextUrl.pathname;
  // the two sign-in pages (+ the old /login, which just forwards to /merchant/login)
  const onLogin = path === "/login" || path === "/merchant/login" || path === "/admin/login";
  const inAdmin = path === "/admin" || path.startsWith("/admin/");

  // CUSTOMER QR PAGES: open to everyone, no login. ONLY "/order/…" — every other address stays staff-only.
  if (path === "/order" || path.startsWith("/order/")) return response;

  // CUSTOMER APP API: open to the app, no staff login (each API checks what it needs itself)
  if (path.startsWith("/api/v1/")) return response;

  // not signed in → the sign-in page of the portal you tried to open
  if (!user && !onLogin) return NextResponse.redirect(new URL(inAdmin ? "/admin/login" : "/merchant/login", request.url));
  if (!user) return response;

  const admin = isAdminEmail(user.email);

  // already signed in and on a sign-in page → straight in
  // (/admin/login uses the admin login only; a shop login is a separate cookie and never counts here)
  if (path === "/admin/login") return admin ? NextResponse.redirect(new URL("/admin", request.url)) : response;
  if (onLogin || path === "/") return NextResponse.redirect(new URL("/merchant", request.url));

  // ADMIN AREA: only the logins in ADMIN_EMAILS (see lib/admins.ts). Anyone else → the admin sign-in.
  if (inAdmin && !admin) return NextResponse.redirect(new URL("/admin/login", request.url));

  // the Admin Portal = Dashboard, Shops, Logins, Activity only: any other /admin page (old copies of the POS) → Dashboard
  const ADMIN_PAGES = ["/admin", "/admin/shops", "/admin/logins", "/admin/activity"];
  if (inAdmin && !ADMIN_PAGES.some((p) => path === p || (p !== "/admin" && path.startsWith(`${p}/`)))) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  return response;
}

// every address except Next.js files, the favicon, and the app manifest + icons
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-|apple-icon).*)"],
};