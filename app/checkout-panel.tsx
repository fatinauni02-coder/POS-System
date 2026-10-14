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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="w-full max-w-md rounded-3xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold">Payment</h2>

                {/* AMOUNT TO PAY */}
                <div className="mt-4 rounded-2xl bg-tint p-4">
                    {rounding !== 0 && (
                        <div className="flex justify-between text-sm text-ink-2">
                            <span>Total {formatRM(total)} · rounding</span>
                            <span>{rounding > 0 ? "+" : "−"}{formatRM(Math.abs(rounding))}</span>
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
                            className={`h-12 rounded-xl text-sm font-semibold ${method === m.id ? "bg-primary text-white" : "border border-line bg-surface"
                                }`}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>

                {/* CASH ONLY: amount received + quick buttons + change */}
                {method === "cash" && (
                    <div className="mt-4">
                        <label className="block">
                            <span className="text-sm font-semibold text-ink-2">Cash received (RM)</span>
                            <input
                                value={cash}
                                onChange={(e) => setCash(e.target.value)}
                                inputMode="decimal"
                                autoFocus
                                className="mt-1 h-12 w-full rounded-xl bg-tint px-4 text-lg font-bold outline-none focus:ring-2 focus:ring-primary"
                            />
                        </label>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {quick.map((a) => (
                                <button key={a} onClick={() => setCash((a / 100).toFixed(2))} className="h-10 rounded-xl border border-line px-3 font-semibold">
                                    {a === payable ? "Exact" : formatRM(a)}
                                </button>
                            ))}
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
                    <button
                        onClick={confirm}
                        disabled={!canPay || saving}
                        className="h-14 rounded-2xl bg-primary font-bold text-white disabled:opacity-40"
                    >
                        {saving ? "Saving…" : "Confirm payment"}
                    </button>
                </div>
            </div>
        </div>
    );
}