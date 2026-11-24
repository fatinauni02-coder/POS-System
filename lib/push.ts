import "server-only"; // never sent to the browser: it uses the Firebase private key
import { createSign } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

// From the Firebase service-account file (Project settings → Service accounts).
// Set in .env.local and on Vercel. Missing → pushes are simply skipped.
const PROJECT = process.env.FIREBASE_PROJECT_ID;
const EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const KEY = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"); // env vars keep "\n" as text

// FCM tokens are long strings of letters, digits, ":", "-", "_"
export const PUSH_TOKEN = /^[A-Za-z0-9:_\-.]{20,4096}$/;

const b64url = (s: string) => Buffer.from(s).toString("base64url");

// Google wants a short-lived "access token". We sign a small JWT with the private key and swap it.
// Kept for ~1 hour so we don't ask Google on every push.
let cached: { token: string; until: number } | null = null;

async function accessToken() {
    if (cached && cached.until > Date.now() + 60_000) return cached.token;
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(
        JSON.stringify({
            iss: EMAIL,
            scope: "https://www.googleapis.com/auth/firebase.messaging",
            aud: "https://oauth2.googleapis.com/token",
            iat: now,
            exp: now + 3600,
        }),
    );
    const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(KEY!, "base64url");

    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: `${head}.${claims}.${sig}`,
        }),
    });
    if (!res.ok) throw new Error(`Google sign-in failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: j.access_token, until: Date.now() + j.expires_in * 1000 };
    return cached.token;
}

// one notification to one phone. "gone" = the app was uninstalled / token is old
async function sendPush(token: string, title: string, body: string, data: Record<string, string>) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            message: {
                token,
                notification: { title, body },
                data, // the app can read this later (e.g. open the right order)
                android: { priority: "high" },
            },
        }),
    });
    if (res.status === 404 || res.status === 400) {
        const text = await res.text();
        if (text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT")) return "gone";
        throw new Error(`FCM ${res.status}: ${text}`);
    }
    if (!res.ok) throw new Error(`FCM ${res.status}: ${await res.text()}`);
    return "sent";
}

// Tell the customer their QR order is ready / was rejected.
// Never throws: a push is a bonus, the board action already worked.
export async function notifyQrOrder(businessId: string, id: string, kind: "ready" | "rejected") {
    if (!PROJECT || !EMAIL || !KEY) return; // Firebase not set up on this server
    try {
        const { data: q } = await supabaseAdmin
            .from("qr_orders")
            .select("ticket_no, order_type, table_label, push_token, reject_reason")
            .eq("business_id", businessId)
            .eq("id", id)
            .maybeSingle();
        if (!q?.push_token) return; // ordered from the web page, or notifications not allowed

        const { data: shop } = await supabaseAdmin.from("businesses").select("name").eq("id", businessId).maybeSingle();
        const no = `Q${q.ticket_no}`;
        const body =
            kind === "rejected"
                ? `Sorry, order ${no} couldn't be accepted. ${q.reject_reason ?? ""}`.trim()
                : q.order_type === "dine_in"
                  ? `Order ${no} is ready! We're bringing it to table ${q.table_label}.`
                  : `Order ${no} is ready! Please collect it at the counter.`;

        const result = await sendPush(q.push_token, shop?.name ?? "Your order", body, { orderId: id, status: kind });
        if (result === "gone") {
            await supabaseAdmin.from("qr_orders").update({ push_token: null }).eq("id", id); // don't try again
        }
    } catch (e) {
        console.error("push failed:", e);
    }
}
