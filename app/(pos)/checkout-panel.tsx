"use client";

import { useState } from "react";

import { cashRound, formatRM, toSen } from "@/lib/money";

export type Method = "cash" | "card" | "duitnow" | "ewallet";

const METHODS: { id: Method; label: string }[] = [
    { id: "cash", label: "Cash" },
    { id: "card", label: "Card" },
    { id: "duitnow", label: "DuitNow QR" },
    { id: "ewallet", label: "E-wallet" },
];

type Props = {
    total: number; // sen, from the cart (subtotal + SST)
    // saves the order; gives back an error message, or null if it worked
    onPay: (method: Method, tenderedSen: number, payableSen: number) => Promise<string | null>;
    onClose: () => void;
};

// Pop-up: choose how the customer pays; for cash, enter the money received and see the change
export function CheckoutPanel({ total, onPay, onClose }: Props) {
    const [method, setMethod] = useState<Method>("cash");
    const [saving, setSaving] = useState(false); // true while waiting for the server
    const [error, setError] = useState(""); // message from the server, if saving failed
    const [cash, setCash] = useState(""); // what the cashier typed, in RM, e.g. "50"

    // only cash is rounded to 5 sen (cards / QR pay the exact amount)
    const rounding = method === "cash" ? cashRound(total) : 0;
    const payable = total + rounding;

    const tendered = method === "cash" ? toSen(cash) : payable; // money received, in sen
    const change = tendered - payable;
    const canPay = method !== "cash" || (cash !== "" && change >= 0);

    // quick buttons: exact amount + notes bigger than the bill (no duplicates)
    async function confirm() {
        setSaving(true);
        setError("");
        const message = await onPay(method, tendered, payable); // wait for the server
        if (message) {
            setError(message); // failed: show why, let the cashier try again
            setSaving(false);
        }
        // worked: the parent closes this pop-up, nothing more to do here
    }
    const quick = [payable, 1000, 2000, 5000, 10000].filter((a, i, all) => a >= payable && all.indexOf(a) === i);

    // ON-SCREEN KEYPAD (tablets): each key changes the "Cash received" text
    function press(key: string) {
        setCash((c) => {
            if (key === "⌫") return c.slice(0, -1); // delete the last character
            if (key === "." && c.includes(".")) return c; // only one dot
            if (/\.\d{2}$/.test(c)) return c; // already 2 decimals (sen) → ignore more digits
            if (key !== "." && /^\d{5}$/.test(c)) return c; // max RM 99,999 (stops "518888" by accident)
            const next = c === "0" && key !== "." ? key : c + key; // no "05"
            return next === "." ? "0." : next; // "." first → "0."
        });
    }

    const isCash = method === "cash";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            {/* THE BOX: cash on a wide screen = 2 columns (payment left, keypad right), so it fits without scrolling.
                Phones / narrow screens: one column, keypad under the cash box. */}
            <div
                className={`max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-surface p-6 ${isCash ? "md:max-w-3xl" : ""}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={isCash ? "md:grid md:grid-cols-[1fr_260px] md:gap-6" : ""}>
                    {/* LEFT COLUMN */}
                    <div>
                        <h2 className="text-xl font-bold">Payment</h2>

                        {/* AMOUNT TO PAY */}
                        <div className="mt-4 rounded-2xl bg-tint p-4">
                            {rounding !== 0 && (
                                <div className="flex justify-between text-sm text-ink-2">
                                    <span>Total {formatRM(total)} · rounding</span>
                                    <span>
                                        {rounding > 0 ? "+" : "−"}
                                        {formatRM(Math.abs(rounding))}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between text-2xl font-bold">
                                <span>To pay</span>
                                <span className="text-primary">{formatRM(payable)}</span>
                            </div>
                        </div>

                        {/* PAYMENT METHOD: 4 equal buttons in one row */}
                        <div className="mt-4 grid grid-cols-4 gap-2">
                            {METHODS.map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => setMethod(m.id)}
                                    className={`h-12 rounded-xl text-sm font-semibold ${method === m.id ? "bg-primary text-white" : "border border-line bg-surface"}`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        {/* CASH ONLY: amount received + quick buttons + change */}
                        {isCash && (
                            <div className="mt-4">
                                <label className="block">
                                    <span className="text-sm font-semibold text-ink-2">Cash received (RM)</span>
                                    <input
                                        value={cash}
                                        onChange={(e) => setCash(e.target.value)}
                                        inputMode="none" // touch screens: use the keypad, no phone/tablet keyboard popping up
                                        autoFocus // a real keyboard still types here
                                        className="mt-1 h-12 w-full rounded-xl bg-tint px-4 text-lg font-bold outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </label>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {quick.map((a) => (
                                        <button key={a} onClick={() => setCash((a / 100).toFixed(2))} className="h-10 rounded-xl border border-line px-3 font-semibold">
                                            {a === payable ? "Exact" : formatRM(a)}
                                        </button>
                                    ))}
                                    {cash !== "" && (
                                        <button onClick={() => setCash("")} className="h-10 rounded-xl px-3 font-semibold text-red-700">
                                            Clear
                                        </button>
                                    )}
                                </div>
                                {/* KEYPAD here only on narrow screens (md:hidden); wide screens show it on the right */}
                                <div className="md:hidden">
                                    <Keypad onPress={press} />
                                </div>
                                <div className="mt-3 flex justify-between text-lg font-bold">
                                    <span>Change</span>
                                    <span className={change < 0 ? "text-red-700" : "text-green-700"}>
                                        {cash === "" ? "—" : change < 0 ? `${formatRM(-change)} short` : formatRM(change)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

                        <div className="mt-6 grid grid-cols-[1fr_2fr] gap-2">
                            <button onClick={onClose} className="h-14 rounded-2xl bg-tint font-semibold">
                                Back
                            </button>
                            <button onClick={confirm} disabled={!canPay || saving} className="h-14 rounded-2xl bg-primary font-bold text-white disabled:opacity-40">
                                {saving ? "Saving…" : "Confirm payment"}
                            </button>
                        </div>
                    </div>

                    {/* RIGHT COLUMN (wide screens, cash only): the keypad, full height */}
                    {isCash && (
                        <div className="hidden md:flex md:flex-col md:justify-end">
                            <Keypad onPress={press} big />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// 3 × 4 number keys; big = taller keys for the side column
function Keypad({ onPress, big = false }: { onPress: (key: string) => void; big?: boolean }) {
    return (
        <div className="mt-3 grid grid-cols-3 gap-2">
            {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"].map((k) => (
                <button
                    key={k}
                    onClick={() => onPress(k)}
                    aria-label={k === "⌫" ? "Delete" : k}
                    className={`${big ? "h-16" : "h-12"} rounded-xl bg-tint text-xl font-bold active:bg-line`}
                >
                    {k}
                </button>
            ))}
        </div>
    );
}
