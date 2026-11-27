// who may open /admin: a login that
//   1. ends in ".admin" (e.g. auni@kopikira.admin) — shop logins end in ".pos", so they never qualify
//   2. AND is listed in ADMIN_EMAILS (.env.local + Vercel), comma-separated — the second lock
// not set = nobody
export function isAdminEmail(email: unknown) {
  if (typeof email !== "string") return false;
  const value = email.trim().toLowerCase();
  if (!value.endsWith(".admin")) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(value);
}
