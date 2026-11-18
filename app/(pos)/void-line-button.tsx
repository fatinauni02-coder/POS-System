"use client"; // needs useState for the PIN pop-up

import { useState } from "react";

import { voidLine } from "./actions";
import { Spinner } from "@/components/submit-button";

// RESTAURANT MODE: cancel one line that was already sent to the kitchen (manager PIN)
// needPin = false: the shop turned the PIN off for voids (Settings)
export function VoidLineButton({ lineId, label, needPin }: { lineId: number; label: string; needPin: boolean }) {
    const [open, setOpen] = useState(false);
    const [pin, setPin] = useState("");
    const [restock, setRestock] = useState(true); // usually not made yet → stock goes back
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function confirm() {
        setSaving(true);
        setError("");
        const message = await voidLine(lineId, pin, restock);
        setSaving(false);
        if (message) {
            setError(message);
            setPin(""); // clear a wrong PIN
        } else {
            setOpen(false); // the server redraws the screen: the line shows crossed out
        }
    }

    return (
        <>
            <button onClick={() => setOpen(true)} className="ml-2 shrink-0 text-xs font-semibold text-red-700 underline">
                Void
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
                    <div className="w-full max-w-sm rounded-3xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-xl font-bold">Void {label}</h2>
                        <p className="mt-1 text-sm text-ink-2">{needPin ? "Manager PIN needed. It comes off the bill." : "It comes off the bill. No PIN needed (turned off in Settings)."}</p>

                        {needPin && (
                        <input
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} // digits only
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            autoFocus
                            placeholder="PIN"
                            className="mt-4 h-14 w-full rounded-xl bg-tint px-4 text-center text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-primary"
                        />
                        )}

                        {/* untick if the kitchen already made it (the stock was really used) */}
                        <label className="mt-4 flex items-center gap-3">
                            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-5 w-5 accent-primary" />
                            <span>Put the stock back (not made yet)</span>
                        </label>

                        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

                        <div className="mt-6 grid grid-cols-2 gap-2">
                            <button onClick={() => setOpen(false)} className="h-12 rounded-2xl bg-tint font-semibold">
                                Cancel
                            </button>
                            <button onClick={confirm} disabled={(needPin && pin.length < 4) || saving} className="h-12 rounded-2xl bg-red-700 font-bold text-white disabled:opacity-40">
                                {saving ? <><Spinner className="mr-1.5 h-4 w-4" />Voiding…</> : "Void"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
