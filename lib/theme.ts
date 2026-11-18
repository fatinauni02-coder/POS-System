// THE SHOP'S COLOURS (Settings → Appearance), same maths as the pos_html prototype (store.js).
// The shop picks 4 colours; everything else (soft tints, borders, button text, grey text)
// is worked out from them. Used by the server (ThemeStyle) and the browser (the live preview).

export type Theme = { preset: string; primary: string; background: string; surface: string; text: string };

export const THEME_PRESETS: Record<string, { name: string; primary: string; background: string; surface: string; text: string }> = {
    kopitiam: { name: "Kopitiam", primary: "#9a4100", background: "#fff8f5", surface: "#ffffff", text: "#251911" },
    coffee: { name: "Coffee", primary: "#6f4e37", background: "#fff8f0", surface: "#ffffff", text: "#2b2b2b" },
    pandan: { name: "Pandan", primary: "#2f6b3a", background: "#f4f9f2", surface: "#ffffff", text: "#17261a" },
    ocean: { name: "Ocean", primary: "#0d6a8a", background: "#f2f8fb", surface: "#ffffff", text: "#10232c" },
    rose: { name: "Rose", primary: "#a8324f", background: "#fdf4f6", surface: "#ffffff", text: "#2a1419" },
    mono: { name: "Minimal mono", primary: "#222222", background: "#f5f5f4", surface: "#ffffff", text: "#111111" },
};

export const DEFAULT_THEME: Theme = { preset: "kopitiam", ...pick(THEME_PRESETS.kopitiam) };
function pick(p: { primary: string; background: string; surface: string; text: string }) {
    return { primary: p.primary, background: p.background, surface: p.surface, text: p.text };
}

export const HEX = /^#[0-9a-f]{6}$/i;

// whatever is saved in businesses.theme → a full, safe theme (bad / missing colours → the default)
export function readTheme(saved: unknown): Theme {
    const t = (saved ?? {}) as Partial<Theme>;
    const colour = (k: "primary" | "background" | "surface" | "text") =>
        typeof t[k] === "string" && HEX.test(t[k] as string) ? (t[k] as string).toLowerCase() : DEFAULT_THEME[k];
    return {
        preset: typeof t.preset === "string" ? t.preset : "custom",
        primary: colour("primary"),
        background: colour("background"),
        surface: colour("surface"),
        text: colour("text"),
    };
}

function rgb(hex: string) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
// mix(a, b, t): t = 0 → a, t = 1 → b
export const mix = (a: string, b: string, t: number) => toHex(rgb(a).map((c, i) => c + (rgb(b)[i] - c) * t));

function luminance(hex: string) {
    return rgb(hex)
        .map((c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}
// 1 = no difference … 21 = black on white. 4.5 or more = easy to read.
export function contrast(a: string, b: string) {
    const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
}
// white or near-black text, whichever reads better on this colour
export const readableOn = (hex: string) => (contrast(hex, "#ffffff") >= contrast(hex, "#1a1a1a") ? "#ffffff" : "#1a1a1a");

// 4 colours → every --color-* the app uses (globals.css has the same names)
export function themeVars(t: Theme): Record<string, string> {
    return {
        "--color-primary": t.primary,
        "--color-primary-strong": mix(t.primary, "#000000", 0.22),
        "--color-primary-soft": mix(t.primary, "#ffffff", 0.14),
        "--color-on-primary": readableOn(t.primary),
        "--color-tint": mix(t.background, t.primary, 0.06),
        "--color-tint-2": mix(t.background, t.primary, 0.1),
        "--color-tint-3": mix(t.background, t.primary, 0.16),
        "--color-canvas": t.background,
        "--color-surface": t.surface,
        "--color-line": mix(t.background, t.primary, 0.11),
        "--color-ink": t.text,
        "--color-ink-2": mix(t.text, t.background, 0.28),
        "--color-ink-3": mix(t.text, t.background, 0.48),
    };
}

// the default colours keep the hand-tuned values in globals.css
export const isDefault = (t: Theme) => (["primary", "background", "surface", "text"] as const).every((k) => t[k] === DEFAULT_THEME[k]);

// readable-text problems: [message, which colour to fix]
export function themeWarnings(t: Theme): [string, "text" | "primary"][] {
    const w: [string, "text" | "primary"][] = [];
    if (contrast(t.text, t.background) < 4.5) w.push(["Text may be hard to read on the background.", "text"]);
    if (contrast(t.text, t.surface) < 4.5) w.push(["Text may be hard to read on cards.", "text"]);
    if (contrast(t.primary, readableOn(t.primary)) < 4.5) w.push(["Button text may be hard to read on the primary colour.", "primary"]);
    return w;
}

// AUTO-FIX: move the colour towards black (or white) until it reads well (4.5)
export function autoFix(t: Theme, key: "text" | "primary"): Theme {
    if (key === "text") {
        const target = luminance(t.background) > 0.4 ? "#000000" : "#ffffff";
        let text = t.text;
        for (let i = 1; i <= 20 && (contrast(text, t.background) < 4.5 || contrast(text, t.surface) < 4.5); i++) text = mix(t.text, target, i / 20);
        return { ...t, text, preset: "custom" };
    }
    let primary = t.primary;
    for (let i = 1; i <= 20 && contrast(primary, readableOn(primary)) < 4.5; i++) primary = mix(t.primary, "#000000", i / 20);
    return { ...t, primary, preset: "custom" };
}
