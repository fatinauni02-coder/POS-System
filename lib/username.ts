// USERNAMES — Supabase logins always need an email, so a username like "ali"
// is stored as "ali@kopi-co.pos" behind the scenes. Nobody ever sees that address,
// and nothing is ever sent to it. A real email (with @) still works as it is.

export const USERNAME_DOMAIN = "kopi-co.pos";

// 3–20 letters, numbers, dot, dash or underscore, e.g. "ali", "siti.k", "staff_2"
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,20}$/;

// what the person typed → the email Supabase uses
export function toLoginEmail(typed: string) {
    const value = typed.trim().toLowerCase();
    return value.includes("@") ? value : `${value}@${USERNAME_DOMAIN}`;
}

// the email Supabase has → what we show ("ali@kopi-co.pos" → "ali"; real emails stay as they are)
export function displayName(email: string) {
    const ending = `@${USERNAME_DOMAIN}`;
    return email.endsWith(ending) ? email.slice(0, -ending.length) : email;
}
