import { NextResponse, type NextRequest } from "next/server";
import { supabaseAuth } from "@/lib/supabase-server";

// "/merchant/logout" — sign out and back to the sign-in page with a message.
// The top bar sends you here by itself when your login isn't in any (switched-on) shop any more,
// e.g. removed from Staff, or the outlet was switched off.
export async function GET(request: NextRequest) {
    const supabase = await supabaseAuth();
    await supabase.auth.signOut(); // removes the login cookie
    return NextResponse.redirect(new URL("/merchant/login?error=noshop", request.url));
}
