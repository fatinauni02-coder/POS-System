"use client"; // reads the file and shrinks it in the browser

import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Spinner } from "@/components/submit-button";
import { removeLogo, uploadLogo } from "./actions";

// SHOP LOGO (sidebar, customer QR menu): cut to a square from the middle, 256 × 256 px.
// Buttons only (type="button"): the Settings page is one big form, and a form can't hold another form.
export function LogoUpload({ url, initial }: { url: string | null; initial: string }) {
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
            form.set("logo", await squareLogo(file), "logo.png");
            const message = await uploadLogo(form);
            if (message) setError(message);
        } catch {
            setError("Couldn't read that picture. Try another one.");
        }
        setBusy(false);
        if (input.current) input.current.value = "";
    }

    async function remove() {
        setBusy(true);
        await removeLogo();
        setBusy(false);
    }

    return (
        <div className="flex items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-2xl font-bold text-on-primary">
                {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- logo from Supabase Storage
                    <img src={url} alt="" className="h-full w-full object-cover" />
                ) : (
                    initial
                )}
                {busy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                        <Spinner className="h-6 w-6" />
                    </div>
                )}
            </div>
            <div className="flex flex-col gap-1.5">
                <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => picked(e.target.files?.[0])} aria-label="Shop logo" />
                <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-soft flex h-10 items-center gap-1.5 px-3 text-sm">
                        <ImageUp className="h-4 w-4" />
                        {url ? "Change logo" : "Upload logo"}
                    </button>
                    {url && (
                        <button type="button" disabled={busy} onClick={remove} className="press flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-danger hover:bg-danger/10">
                            <Trash2 className="h-4 w-4" />
                            Remove
                        </button>
                    )}
                </div>
                <p className="text-xs text-ink-3">Square works best. Shown in the sidebar and on the customer QR menu.</p>
                {error && <p className="text-xs font-semibold text-danger">{error}</p>}
            </div>
        </div>
    );
}

// cut the middle square out and make it 256 × 256 (PNG keeps see-through logos see-through)
async function squareLogo(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    bitmap.close();
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/png"));
}
