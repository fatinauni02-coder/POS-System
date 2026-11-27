// PLANS & FEATURES — what each merchant (company) pays for. Set in Admin → Shops. Needs migration 028.
// (No server code here, so pages and the sidebar can both use it.)

export const FEATURES = [
    { key: "qr", label: "QR ordering & customer app" },
    { key: "tables", label: "Tables (restaurant mode)" },
    { key: "stock", label: "Stock" },
    { key: "duitnow_app", label: "Pay by DuitNow in the app" },
    { key: "outlets", label: "Multiple outlets (HQ)" },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export type Features = Record<FeatureKey, boolean>;
export type Plan = "basic" | "pro" | "premium" | "custom";

export const ALL_ON: Features = { qr: true, tables: true, stock: true, duitnow_app: true, outlets: true };
const ALL_OFF: Features = { qr: false, tables: false, stock: false, duitnow_app: false, outlets: false };

// the 3 ready-made plans (custom = ticked one by one)
export const PLANS: Record<Exclude<Plan, "custom">, { label: string; features: Features }> = {
    basic: { label: "Basic", features: { ...ALL_OFF } },
    pro: { label: "Pro", features: { ...ALL_OFF, qr: true, tables: true, stock: true } },
    premium: { label: "Premium", features: { ...ALL_ON } },
};

// whatever is saved → a full set (missing keys = off)
export function readFeatures(value: unknown): Features {
    const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    return Object.fromEntries(FEATURES.map((f) => [f.key, v[f.key] === true])) as Features;
}
