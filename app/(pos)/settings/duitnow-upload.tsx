"use client"; // reads the picture in the browser (and shrinks it only if it's too big)

import { QrCode, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Spinner } from "@/components/submit-button";
import { removeDuitnowQr, uploadDuitnowQr } from "./actions";

// SHOP DUITNOW QR: the picture from the shop's bank app (Maybank / CIMB / TnG Merchant…).
// NOT cut to a square and NOT made small like the logo: a blurry QR won't scan.
// Buttons only (type="button"): the Settings page is one big form.
export function DuitnowUpload({ url }: { url: string | null }) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function picked(file: File | undefined) {
        if (!file) return;
        setError("");
        if (!file.type.startsWith("image/")) return setError("That isn't a picture");
        setBusy(true);
        try {
            const form = new FormData();
            // small enough → send as it is; too big → shrink (still sharp: max 1200 px)
            const blob = file.size <= 1024 * 1024 && ["image/png", "image/jpeg", "image/webp"].includes(file.type) ? file : await shrink(file);
            form.set("qr", blob, "duitnow.png");
            const message = await uploadDuitnowQr(form);
            if (message) setError(message);
        } catch {
            setError("Couldn't read that picture. Try another one.");
        }
        setBusy(false);
        if (input.current) input.current.value = "";
    }

    async function remove() {
        setBusy(true);
        await removeDuitnowQr();
        setBusy(false);
    }

    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* preview on white, like it will look on the customer's phone */}
            <div className="relative flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-white p-2">
                {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- picture from Supabase Storage
                    <img src={url} alt="DuitNow QR" className="h-full w-full object-contain" />
                ) : (
                    <QrCode className="h-14 w-14 text-ink-3" />
                )}
                {busy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                        <Spinner className="h-6 w-6" />
                    </div>
                )}
            </div>
            <div className="flex flex-col gap-1.5">
                <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => picked(e.target.files?.[0])} aria-label="DuitNow QR picture" />
                <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-soft flex h-10 items-center gap-1.5 px-3 text-sm">
                        <Upload className="h-4 w-4" />
                        {url ? "Change QR" : "Upload QR"}
                    </button>
                    {url && (
                        <button type="button" disabled={busy} onClick={remove} className="press flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-danger hover:bg-danger/10">
                            <Trash2 className="h-4 w-4" />
                            Remove
                        </button>
                    )}
                </div>
                <p className="max-w-sm text-xs text-ink-3">
                    Download the DuitNow QR from your bank&apos;s merchant app and upload it here. Test it once: scan it with your own banking app and check the name that shows.
                </p>
                {error && <p className="text-xs font-semibold text-danger">{error}</p>}
            </div>
        </div>
    );
}

// keep the whole picture (no cutting), longest side max 1200 px, PNG = sharp edges for the QR
async function shrink(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.imageSmoothingEnabled = false; // QR squares stay crisp
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/png"));
}
