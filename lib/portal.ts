// TWO PORTALS, TWO SEPARATE LOGINS in the same browser:
//   /merchant… → the normal Supabase login cookie (unchanged, so nobody gets signed out)
//   /admin…    → its own cookie "sb-pos-admin", so admin and a shop login can be open side by side
// proxy.ts works out the portal from the address and passes it on in this header.
export const PORTAL_HEADER = "x-pos-portal";
export type Portal = "admin" | "merchant";

export function portalOf(path: string): Portal {
    return path === "/admin" || path.startsWith("/admin/") ? "admin" : "merchant";
}

// Supabase cookie settings per portal (undefined = Supabase's normal cookie)
export function authCookieOptions(portal: Portal) {
    return portal === "admin" ? { name: "sb-pos-admin" } : undefined;
}
