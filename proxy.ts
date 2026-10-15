import { NextResponse, type NextRequest } from "next/server";

// A simple password gate for the WHOLE app — runs before every page and Server Action.
// The browser shows its own login box. Username: anything. Password: SITE_PASSWORD.
// If SITE_PASSWORD is not set (e.g. on your laptop), the gate is off.
export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  // the browser sends "Basic <base64 of username:password>"
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6)); // "anything:the-password"
    const typed = decoded.slice(decoded.indexOf(":") + 1);
    if (typed === password) return NextResponse.next(); // right password → carry on
  }

  // no / wrong password → ask the browser to show its login box
  return new NextResponse("Password needed", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="POS"' },
  });
}

// run on every address except Next.js's own files (CSS, JS, images)
export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-|apple-icon).*)"],
};