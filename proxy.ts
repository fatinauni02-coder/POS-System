import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// runs before EVERY page and Server Action:
// not signed in → go to /login. Signed in and on /login → go to the Order screen.
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const onLogin = request.nextUrl.pathname === "/login";

  if (!user && !onLogin) return NextResponse.redirect(new URL("/login", request.url));
  if (user && onLogin) return NextResponse.redirect(new URL("/", request.url));
  return response;
}

// every address except Next.js files, the favicon, and the app manifest + icons
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-|apple-icon).*)"],
};