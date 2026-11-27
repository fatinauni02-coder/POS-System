"use client"; // colour pickers + live preview change as you click

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { autoFix, HEX, THEME_PRESETS, themeVars, themeWarnings, type Theme } from "@/lib/theme";

type Key = "primary" | "background" | "surface" | "text";
const COLOURS: { key: Key; label: string; hint: string }[] = [
    { key: "primary", label: "Primary", hint: "Charge button, active tabs, prices" },
    { key: "background", label: "Background", hint: "Page behind everything" },
    { key: "surface", label: "Cards", hint: "Item cards, panels, receipt" },
    { key: "text", label: "Text", hint: "Main text colour" },
];

// APPEARANCE: presets + 4 colours + readable-text check + live preview.
// The chosen colours go into hidden boxes of the Settings form, so "Save settings" saves them.
export function ThemeEditor({ initial, shopName, logoUrl }: { initial: Theme; shopName: string; logoUrl: string | null }) {
    const [t, setT] = useState<Theme>(initial);
    // what's typed in each hex box (can be half-typed, e.g. "#9a4")
    const [typed, setTyped] = useState<Record<Key, string>>({ primary: initial.primary, background: initial.background, surface: initial.surface, text: initial.text });
    const warnings = themeWarnings(t);

    function setColour(key: Key, value: string) {
        setTyped((now) => ({ ...now, [key]: value }));
        if (HEX.test(value)) setT((now) => ({ ...now, [key]: value.toLowerCase(), preset: "custom" }));
    }
    function use(next: Theme) {
        setT(next);
        setTyped({ primary: next.primary, background: next.background, surface: next.surface, text: next.text });
    }

    return (
        <div className="grid gap-6 xl:grid-cols-2">
            {/* the values the form sends */}
            <input type="hidden" name="theme_preset" value={t.preset} />
            {COLOURS.map(({ key }) => (
                <input key={key} type="hidden" name={`theme_${key}`} value={t[key]} />
            ))}

            <div className="space-y-5">
                <div>
                    <p className="label-caps mb-2 text-ink-2">Presets</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {Object.entries(THEME_PRESETS).map(([id, p]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => use({ preset: id, primary: p.primary, background: p.background, surface: p.surface, text: p.text })}
                                className={`press rounded-xl border-2 p-2 text-left text-sm font-semibold ${t.preset === id ? "border-primary-soft bg-tint" : "border-line hover:bg-tint"}`}
                            >
                                <span className="mb-1.5 flex h-6 overflow-hidden rounded-md">
                                    <span className="flex-[2]" style={{ background: p.primary }} />
                                    <span className="flex-1" style={{ background: p.background }} />
                                    <span className="flex-1" style={{ background: p.text }} />
                                </span>
                                {p.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                    <p className="label-caps text-ink-2">{t.preset === "custom" ? "Custom colours" : "Colours"}</p>
                    {COLOURS.map(({ key, label, hint }) => (
                        <div key={key} className="flex items-center gap-3">
                            {/* the coloured square IS the colour picker (the real picker is invisible on top) */}
                            <label className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-line" style={{ background: t[key] }}>
                                <input
                                    type="color"
                                    value={t[key]}
                                    onChange={(e) => setColour(key, e.target.value)}
                                    aria-label={`${label} colour`}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                />
                            </label>
                            <div className="flex-1">
                                <p className="font-semibold">{label}</p>
                                <p className="text-xs text-ink-3">{hint}</p>
                            </div>
                            <input
                                value={typed[key]}
                                onChange={(e) => setColour(key, e.target.value.trim())}
                                maxLength={7}
                                aria-label={`${label} hex`}
                                className={`money h-11 w-28 rounded-xl bg-tint px-3 font-semibold uppercase outline-none focus:ring-2 focus:ring-primary-soft ${HEX.test(typed[key]) ? "" : "ring-2 ring-danger"}`}
                            />
                        </div>
                    ))}
                </div>

                {/* readable-text check */}
                {warnings.length > 0 ? (
                    warnings.map(([message, key]) => (
                        <p key={message} className="flex items-center gap-2 rounded-xl bg-warning/15 p-3 text-sm font-semibold">
                            <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
                            <span className="flex-1">{message}</span>
                            <button type="button" onClick={() => use(autoFix(t, key))} className="font-bold text-primary underline">
                                Auto-fix
                            </button>
                        </p>
                    ))
                ) : (
                    <p className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm font-semibold text-success">
                        <CircleCheck className="h-4 w-4" />
                        Contrast looks good
                    </p>
                )}
            </div>

            {/* LIVE PREVIEW: the same classes as the real screens, with the new colours on this box only */}
            <div>
                <p className="label-caps mb-2 text-ink-2">Live preview</p>
                <div style={themeVars(t) as React.CSSProperties} className="overflow-hidden rounded-2xl border border-line bg-canvas text-ink shadow-card">
                    <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
                        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-primary text-sm font-bold text-on-primary">
                            {logoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- logo from Supabase Storage
                                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                                shopName.charAt(0)
                            )}
                        </span>
                        <span className="font-bold">{shopName || "Business name"}</span>
                        <span className="ml-auto rounded-full bg-tint px-2.5 py-1 text-xs font-semibold">ali · staff</span>
                    </div>
                    <div className="grid grid-cols-[1.2fr_1fr] gap-3 p-4">
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <span className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary">Coffee</span>
                                <span className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold">Pastries</span>
                            </div>
                            <div className="card p-2">
                                <div className="flex aspect-square items-center justify-center rounded-lg bg-tint-3 text-2xl font-bold text-primary/50">L</div>
                                <p className="mt-2 px-1 text-sm font-semibold">Iced Latte</p>
                                <p className="money px-1 pb-1 text-sm font-bold text-primary">RM 12.00</p>
                            </div>
                        </div>
                        <div className="flex flex-col rounded-xl bg-surface p-3 shadow-card">
                            <div className="grid grid-cols-2 gap-1 rounded-lg bg-tint p-1 text-[11px] font-semibold">
                                <span className="rounded-md bg-surface py-1 text-center shadow-card">Dine-in</span>
                                <span className="py-1 text-center text-ink-2">Takeaway</span>
                            </div>
                            <p className="mt-3 text-sm font-semibold">2 × Iced Latte</p>
                            <p className="text-xs text-ink-2">• Oat milk (+RM 2.00)</p>
                            <div className="money mt-auto flex justify-between pt-3 text-xs text-ink-2">
                                <span>Subtotal</span>
                                <span>RM 28.00</span>
                            </div>
                            <span className="money mt-2 rounded-lg bg-primary py-2 text-center text-xs font-bold text-on-primary">Charge RM 29.70</span>
                        </div>
                    </div>
                </div>
                <p className="mt-2 text-xs text-ink-3">Press Save settings to use these colours on every screen (and the customer QR menu).</p>
            </div>
        </div>
    );
}
