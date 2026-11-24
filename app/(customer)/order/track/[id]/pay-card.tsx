"use client"; // buttons + "I've paid" run in the customer's browser

import { CircleCheck, Download, Hourglass, QrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Spinner } from "@/components/submit-button";
import { formatRM } from "@/lib/money";

type Payment = { qrUrl: string; name: string | null; amountDueSen: number; claimed: boolean };

// "Pay by DuitNow" on the website track page (same as the app's PayCard).
// A phone can't scan its own screen → save the QR, then the banking app's "Scan → from gallery".
// "I've paid" only tells the staff (POST /api/v1/orders/<id>/paid) — they confirm after checking their bank.
export function PayCard({ id, ticketNo, payment: p }: { id: string; ticketNo: number; payment: Payment }) {
    const router = useRouter();
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const amount = formatRM(p.amountDueSen);

    async function claim() {
        setSending(true);
        setError("");
        try {
            const res = await fetch(`/api/v1/orders/${id}/paid`, { method: "POST" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.message ?? "Couldn't send. Please tell the staff you've paid.");
            } else {
                router.refresh(); // page reloads its data → "staff are checking"
            }
        } catch {
            setError("No connection. Please tell the staff you've paid.");
        }
        setSending(false);
    }

    return (
        <div className="card mt-3 p-4">
            <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" />
                <p className="flex-1 font-bold">Pay by DuitNow</p>
                <p className="money text-lg font-extrabold text-primary">{amount}</p>
            </div>

            {/* THE QR (tap = open full size) */}
            <a href={p.qrUrl} target="_blank" rel="noopener" className="mx-auto mt-3 block w-fit rounded-2xl border border-line bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- picture from Supabase Storage */}
                <img src={p.qrUrl} alt="Shop DuitNow QR" className="h-48 w-48 object-contain" />
            </a>
            {p.name && <p className="mt-2 text-center text-sm font-semibold text-ink-2">Pays to: {p.name}</p>}

            {p.claimed ? (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-tint-2 p-3 text-sm">
                    <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Thanks! The staff are checking your payment of {amount}. This page turns &quot;Paid&quot; when it&apos;s confirmed.
                </p>
            ) : (
                <>
                    <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-sm text-ink-2">
                        <li>Save the QR (or long-press it → Save image, or take a screenshot)</li>
                        <li>Banking app → Scan → choose from gallery</li>
                        <li>
                            Pay <b className="money text-ink">{amount}</b> · reference <b className="text-ink">Q{ticketNo}</b>
                        </li>
                        <li>Come back here and tap &quot;I&apos;ve paid&quot;</li>
                    </ol>
                    <div className="mt-3 flex gap-2">
                        {/* download= works when the browser allows it; otherwise it opens the picture to long-press */}
                        <a href={p.qrUrl} download={`duitnow-Q${ticketNo}.png`} target="_blank" rel="noopener" className="btn-soft flex h-12 flex-1 items-center justify-center gap-1.5">
                            <Download className="h-4 w-4" />
                            Save QR
                        </a>
                        <button type="button" onClick={claim} disabled={sending} className="btn-primary flex h-12 flex-1 items-center justify-center gap-1.5">
                            {sending ? <Spinner className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
                            I&apos;ve paid
                        </button>
                    </div>
                </>
            )}
            {error && <p className="mt-2 text-center text-sm font-semibold text-danger">{error}</p>}
            <p className="mt-2 text-center text-xs text-ink-3">Prefer cash or card? Just pay at the counter.</p>
        </div>
    );
}
