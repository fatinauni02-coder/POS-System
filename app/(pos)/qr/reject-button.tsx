"use client"; // the pop-up with reasons needs state

import { X } from "lucide-react";
import { useState } from "react";

import { rejectQr } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const REASONS = ["Item sold out", "Kitchen closing", "Please order at the counter"];

// "Reject" → pop-up with ready-made reasons (the customer sees the one you pick on their phone)
export function RejectButton({ id, code }: { id: string; code: string }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)} className="btn-soft flex h-11 flex-1 items-center justify-center gap-1.5 text-sm text-danger">
                <X className="h-4 w-4" />
                Reject
            </button>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
                    <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-xl font-bold">Reject {code}?</h2>
                        <p className="mt-1 text-sm text-ink-2">The customer sees this reason on their phone.</p>
                        {/* each reason is its own little form → sends id + reason to rejectQr */}
                        <div className="mt-4 grid gap-2">
                            {REASONS.map((r) => (
                                <form key={r} action={rejectQr}>
                                    <input type="hidden" name="id" value={id} />
                                    <input type="hidden" name="reason" value={r} />
                                    <SubmitButton className="btn-soft h-12 w-full px-4 text-left">{r}</SubmitButton>
                                </form>
                            ))}
                        </div>
                        <button type="button" onClick={() => setOpen(false)} className="mt-3 h-11 w-full font-semibold text-ink-2">
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
