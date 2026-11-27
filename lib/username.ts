// USERNAMES — Supabase logins always need an email, so a username like "ali"
// is stored as "ali@<shop's login_domain>" behind the scenes, e.g. "ali@kopi-co.pos".
// Each shop has its own ending, so two shops can both have an "ali".
// Nobody ever sees that address, and nothing is ever sent to it. A real email (with @) still works as it is.

// 3–20 letters, numbers, dot, dash or underscore, e.g. "ali", "siti.k", "staff_2"
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,20}$/;

// shop code (what staff type in "Shop code"), e.g. "kopikira", "kedai-ali"
export const SHOP_CODE_PATTERN = /^[a-z0-9-]{3,30}$/;

// the hidden ending for a shop's logins (migration 019 fills login_domain; fallback = "<code>.pos")
export function loginDomain(shop: { slug: string; login_domain?: string | null }) {
    return shop.login_domain || `${shop.slug}.pos`;
}

// what the person typed + their shop → the email Supabase uses ("ali" → "ali@kopi-co.pos")
export function toLoginEmail(typed: string, domain: string) {
    const value = typed.trim().toLowerCase();
    return value.includes("@") ? value : `${value}@${domain}`;
}

// the email Supabase has → what we show ("ali@kopi-co.pos" → "ali"; real emails stay as they are)
export function displayName(email: string) {
    return email.replace(/@[a-z0-9.-]+\.pos$/, "");
}
