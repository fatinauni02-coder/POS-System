"use client"; // reads the file and shrinks it in the browser

import { Camera, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Spinner, SubmitButton } from "@/components/submit-button";
import { removeItemPhoto, uploadItemPhoto } from "./actions";

// PHOTO in the Menu editor: the picture + "Upload / Change photo" (+ "Remove").
// Phone photos are big (3–8 MB), so the browser first shrinks it to max 800 px
// as a JPEG (~100–200 KB). Smaller file = faster upload and a faster customer menu.
export function PhotoUpload({ itemId, name, url }: { itemId: number; name: string; url: string | null }) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function picked(file: File | undefined) {
        if (!file) return;
        setError("");
        if (!file.type.startsWith("image/")) return setError("That isn't a photo");
        setBusy(true);
        try {
            const small = await shrink(file);
            const form = new FormData();
            form.set("id", String(itemId));
            form.set("photo", small, "photo.jpg");
            const message = await uploadItemPhoto(form);
            if (message) setError(message);
        } catch {
            setError("Couldn't read that photo. Try another one.");
        }
        setBusy(false);
        if (input.current) input.current.value = ""; // so the same file can be picked again
    }

    return (
        <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photo from Supabase Storage
                    <img src={url} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-tint-3 text-2xl font-bold text-primary/60">{name.charAt(0) || "?"}</div>
                )}
                {busy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                        <Spinner className="h-6 w-6" />
                    </div>
                )}
            </div>
            <div className="flex flex-col gap-1.5">
                <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => picked(e.target.files?.[0])} aria-label="Item photo" />
                <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-soft flex h-10 items-center gap-1.5 px-3 text-sm">
                    <Camera className="h-4 w-4" />
                    {busy ? "Uploading…" : url ? "Change photo" : "Upload photo"}
                </button>
                {url && !busy && (
                    <form action={removeItemPhoto}>
                        <input type="hidden" name="id" value={itemId} />
                        <SubmitButton className="press flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-danger hover:bg-danger/10">
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                        </SubmitButton>
                    </form>
                )}
                {error && <p className="text-xs font-semibold text-danger">{error}</p>}
            </div>
        </div>
    );
}

// shrink + crop-free resize: the longest side becomes at most 800 px, saved as JPEG 82%
async function shrink(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#fff"; // see-through PNGs get a white background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/jpeg", 0.82));
}
