import "server-only"; // uses the secret key — server only
import { createHmac, timingSafeEqual } from "node:crypto";

// An "approval slip": after the manager PIN is checked, the server gives the browser a
// signed slip like "1760342400000.9f3a…". The browser can READ it but can't FAKE or CHANGE it,
// because making the signature needs the secret key, which only the server has.
const SECRET = process.env.SUPABASE_SECRET_KEY!;

function sign(text: string, expires: number) {
  return createHmac("sha256", SECRET).update(`${text}|${expires}`).digest("hex");
}

// make a slip for `text` (e.g. "discount:<shop id>:20"), valid for some minutes
export function makeApproval(text: string, minutes = 30) {
  const expires = Date.now() + minutes * 60_000;
  return `${expires}.${sign(text, expires)}`;
}

// is this slip real, for exactly this text, and not expired?
export function isApproved(token: string | null | undefined, text: string) {
  const [exp, sig] = (token ?? "").split(".");
  const expires = Number(exp);
  if (!sig || !(expires > Date.now())) return false;
  const good = Buffer.from(sign(text, expires), "hex");
  const given = Buffer.from(sig, "hex");
  return good.length === given.length && timingSafeEqual(good, given);
}

// DISCOUNT SLIP with the approver's name in front: "ali~<expires>.<signature>".
// The name is part of what's signed, so it can't be swapped for someone else's.
export function makeDiscountApproval(businessId: string, pct: number, by: string) {
  return `${encodeURIComponent(by)}~${makeApproval(`discount:${businessId}:${pct}:${by}`)}`;
}

// the approver's name if the slip is real for this shop + %, otherwise null
export function discountApprovedBy(token: string | null | undefined, businessId: string, pct: number) {
  const [name, slip] = (token ?? "").split("~");
  if (!name || !slip) return null;
  const by = decodeURIComponent(name);
  return isApproved(slip, `discount:${businessId}:${pct}:${by}`) ? by : null;
}
