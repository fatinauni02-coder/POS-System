"use client";

import { ArrowLeft, ArrowRight, Banknote, CircleCheck, CreditCard, Delete, QrCode, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cashRound, formatRM } from "@/lib/money";
import { Spinner } from "@/components/submit-button";

// Look copied from the approved prototype: pos_html/checkout.html + assets/pages/checkout.js
// (big method tiles, "Cash tendered / Change due" boxes, quick amounts, till-style keypad).

export type Method = "cash" | "card" | "duitnow" | "ewallet";

const METHODS: { id: Method; label: string; Icon: LucideIcon }[] = [
    { id: "cash", label: "Cash", Icon: Banknote },
    { id: "card", label: "Card", Icon: CreditCard },
    { id: "duitnow", label: "DuitNow QR", Icon: QrCode },
    { id: "ewallet", label: "E-wallet", Icon: Wallet },
];

// what the cashier sees for non-cash payments
const TERMINAL: Record<Exclude<Method, "cash">, { title: string; hint: string }> = {
    card: { title: "Tap, insert or swipe card", hint: "Wait for the card terminal to show Approved, then confirm." },
    duitnow: { title: "Customer scans DuitNow QR", hint: "Confirm once the payment notification arrives." },
    ewallet: { title: "Scan customer's e-wallet", hint: "Touch 'n Go, GrabPay, ShopeePay… Confirm once it shows success." },
};

// note suggestions: exact, then the next RM10 / RM20 / RM50 / RM100 (no duplicates, max 5)
function quickAmounts(due: number) {
    const up = (n: number) => Math.ceil(due / n) * n;
    return [...new Set([due, up(1000), up(2000), up(5000), up(10000)])].sort((a, b) => a - b).slice(0, 5);
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];
const MAX_SEN = 10_000_00; // RM 10,000 — stops a mistyped "518888"

type Props = {
    total: number; // sen, from the cart (subtotal + SST)
    // saves the order; gives back an error message, or null if it worked
    onPay: (method: Method, tenderedSen: number, payableSen: number) => Promise<string | null>;
    onClose: () => void;
};

// Pop-up: choose how the customer pays; for cash, key in the money received and see the change
export function CheckoutPanel({ total, onPay, onClose }: Props) {
    const [method, setMethod] = useState<Method>("cash");
    const [tendered, setTendered] = useState(0); // cash received, in sen (keypad works like a till: 5 0 0 0 = RM 50.00)
    const [saving, setSaving] = useState(false); // true while waiting for the server
    const [error, setError] = useState(""); // message from the server, if saving failed

    const cash = method === "cash";
    // only cash is rounded to 5 sen (cards / QR pay the exact amount)
    const rounding = cash ? cashRound(total) : 0;
    const payable = total + rounding;
    const change = tendered - payable;
    const canPay = !cash || change >= 0;
    const MethodIcon = METHODS.find((m) => m.id === method)!.Icon; // icon of the picked method (for the terminal box)

    // KEYPAD: digits shift in from the right, like a cash register
    function press(key: string) {
        if (key === "C") setTendered(0);
        else if (key === "⌫") setTendered((t) => Math.floor(t / 10));
        else setTendered((t) => (t * 10 + Number(key) <= MAX_SEN ? t * 10 + Number(key) : t));
    }

    // a real keyboard works too: digits, Backspace, Escape = clear
    useEffect(() => {
        if (!cash) return;
        function onKey(e: KeyboardEvent) {
            if (/^\d$/.test(e.key)) press(e.key);
            else if (e.key === "Backspace") press("⌫");
            else if (e.key === "Escape") press("C");
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [cash]);

    async function confirm() {
        setSaving(true);
        setError("");
        const message = await onPay(method, cash ? tendered : payable, payable); // wait for the server
        if (message) {
            setError(message); // failed: show why, let the cashier try again
            setSaving(false);
        }
        // worked: the parent closes this pop-up, nothing more to do here
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[2px]" onClick={onClose}>
            <div
                className="no-scrollbar max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-surface p-5 shadow-modal md:max-w-4xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* HEADER */}
                <div className="mb-4 flex items-center gap-3">
                    <button type="button" onClick={onClose} className="btn-soft flex h-11 items-center gap-2 px-4 text-sm">
                        <ArrowLeft className="h-4 w-4" />
                        Back to order
                    </button>
                    <h2 className="text-2xl font-bold tracking-tight">Checkout</h2>
                </div>

                {/* 2 columns on wide screens: payment left, cash keys / terminal right */}
                <div className="grid gap-5 md:grid-cols-2">
                    {/* LEFT */}
                    <div className="flex flex-col gap-4">
                        {/* AMOUNT DUE */}
                        <div className="flex items-center justify-between rounded-xl bg-tint p-4">
                            <div>
                                <p className="label-caps text-ink-2">Total amount due</p>
                                {rounding !== 0 && (
                                    <p className="money text-xs text-ink-3">
                                        {formatRM(total)} · cash rounding {rounding > 0 ? "+" : "−"}
                                        {formatRM(Math.abs(rounding))}
                                    </p>
                                )}
                            </div>
                            <p className="money text-[34px] font-bold leading-none tracking-tight text-primary">{formatRM(payable)}</p>
                        </div>

                        {/* PAYMENT METHOD: big tiles, 4 across (2×2 on phones) */}
                        <div>
                            <p className="label-caps mb-2 text-ink-2">Payment method</p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Payment method">
                                {METHODS.map(({ id, label, Icon }) => {
                                    const on = id === method;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            role="radio"
                                            aria-checked={on}
                                            onClick={() => setMethod(id)}
                                            className={`press relative flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 text-sm font-semibold ${
                                                on ? "border-primary-soft bg-tint text-primary" : "border-line hover:bg-tint"
                                            }`}
                                        >
                                            {on && <CircleCheck className="absolute right-2 top-2 h-4 w-4" />}
                                            <Icon className="h-6 w-6" />
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* CASH: tendered + change boxes */}
                        {cash && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-tint p-4">
                                    <p className="label-caps text-ink-2">Cash tendered</p>
                                    <p className="money mt-1 text-[28px] font-bold leading-tight">{formatRM(tendered)}</p>
                                </div>
                                <div className={`rounded-2xl bg-tint-2 p-4 ${change < 0 ? "opacity-50" : ""}`}>
                                    <p className="label-caps text-primary">Change due</p>
                                    <p className="money mt-1 text-[28px] font-bold leading-tight text-primary">{change >= 0 ? formatRM(change) : "—"}</p>
                                </div>
                            </div>
                        )}

                        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm font-semibold text-danger">{error}</p>}

                        {/* COMPLETE (at the bottom of the left column) */}
                        <button type="button" onClick={confirm} disabled={!canPay || saving} className="btn-primary mt-auto flex h-16 items-center justify-center gap-3 text-xl">
                            {saving ? <><Spinner className="h-5 w-5" /> Saving…</> : cash && !canPay ? `Enter cash ≥ ${formatRM(payable)}` : `Complete payment · ${formatRM(payable)}`}
                            {!saving && canPay && <ArrowRight className="h-6 w-6" />}
                        </button>
                    </div>

                    {/* RIGHT */}
                    {cash ? (
                        <div className="flex flex-col gap-4">
                            {/* QUICK AMOUNTS */}
                            <div>
                                <p className="label-caps mb-2 text-ink-2">Quick amounts</p>
                                <div className="grid grid-cols-5 gap-2">
                                    {quickAmounts(payable).map((a, i) => (
                                        <button
                                            key={a}
                                            type="button"
                                            onClick={() => setTendered(a)}
                                            className={`press money h-12 rounded-xl text-sm font-bold ${a === tendered ? "bg-primary text-on-primary" : "bg-tint hover:bg-tint-3"}`}
                                        >
                                            {i === 0 ? "Exact" : formatRM(a).replace(".00", "")}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* KEYPAD: 1-9, C (clear, red), 0, ⌫ */}
                            <div className="grid grid-cols-3 gap-2">
                                {KEYS.map((k) => (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => press(k)}
                                        aria-label={k === "⌫" ? "Backspace" : k === "C" ? "Clear amount" : k}
                                        className={`press h-14 rounded-xl text-2xl font-semibold ${k === "C" ? "bg-tint text-danger" : "bg-tint hover:bg-tint-3"}`}
                                    >
                                        {k === "⌫" ? <Delete className="mx-auto h-6 w-6" /> : k}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // CARD / QR / E-WALLET: what to do on the terminal
                        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-tint p-8 text-center">
                            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-primary">
                                <MethodIcon className="h-8 w-8" />
                            </span>
                            <p className="text-xl font-bold">{TERMINAL[method].title}</p>
                            <p className="max-w-sm text-ink-2">{TERMINAL[method].hint}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
