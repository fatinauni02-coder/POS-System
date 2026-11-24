"use client"; // finds the QR in the picture and crops it — all in the browser, before uploading

import { QrCode, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Spinner } from "@/components/submit-button";
import { removeDuitnowQr, uploadDuitnowQr } from "./actions";

// SHOP DUITNOW QR: any picture that has the shop's DuitNow QR in it (bank app screenshot,
// standee poster, photo). We find the QR, keep ONLY the QR (+ a white border), and check
// it's a payment QR. Buttons only (type="button"): the Settings page is one big form.
export function DuitnowUpload({ url }: { url: string | null }) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [found, setFound] = useState(""); // name read from inside the QR

    async function picked(file: File | undefined) {
        if (!file) return;
        setError("");
        setFound("");
        if (!file.type.startsWith("image/")) return setError("That isn't a picture");
        setBusy(true);
        try {
            const qr = await cropToQr(file);
            if (typeof qr === "string") {
                setError(qr); // no QR / not a payment QR
            } else {
                const form = new FormData();
                form.set("qr", qr.blob, "duitnow.png");
                const message = await uploadDuitnowQr(form);
                if (message) setError(message);
                else if (qr.name) {
                    setFound(qr.name);
                    // fill "Name customers will see" if it's still empty (that box is part of the big settings form)
                    const box = document.querySelector<HTMLInputElement>('input[name="duitnow_name"]');
                    if (box && !box.value.trim()) box.value = qr.name;
                }
            }
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
                    Any picture with your DuitNow QR works (screenshot, poster, photo): we keep only the QR. Test it once with your own banking app.
                </p>
                {found && <p className="text-xs font-semibold text-success">QR found ✓ · Name in the QR: {found}</p>}
                {error && <p className="text-xs font-semibold text-danger">{error}</p>}
            </div>
        </div>
    );
}

// ---------- find + crop ----------

type Cropped = { blob: Blob; name: string | null };

// returns the cropped QR, or an error message (string)
async function cropToQr(file: File): Promise<Cropped | string> {
    const { default: jsQR } = await import("jsqr"); // loaded only when someone uploads (keeps the page small)
    const bitmap = await createImageBitmap(file);

    // 1. look for the QR on a copy at most 1600 px (big photos are slow to scan)
    const scan = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scan);
    const h = Math.round(bitmap.height * scan);
    const look = document.createElement("canvas");
    look.width = w;
    look.height = h;
    const lctx = look.getContext("2d", { willReadFrequently: true });
    if (!lctx) throw new Error("no canvas");
    lctx.drawImage(bitmap, 0, 0, w, h);
    const hit = jsQR(lctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
    if (!hit) {
        bitmap.close();
        return "No QR code found in this picture. Try a clearer, straight-on picture of the QR.";
    }

    // 2. is it a payment QR? DuitNow (and every EMV payment QR) starts with "000201"
    if (!hit.data.startsWith("000201")) {
        bitmap.close();
        return "That QR isn't a payment QR. Use the DuitNow QR from your bank's merchant app.";
    }

    // 3. the QR's corners → a box on the ORIGINAL picture, plus a white border (QR needs a "quiet zone")
    const L = hit.location;
    const xs = [L.topLeftCorner.x, L.topRightCorner.x, L.bottomLeftCorner.x, L.bottomRightCorner.x].map((x) => x / scan);
    const ys = [L.topLeftCorner.y, L.topRightCorner.y, L.bottomLeftCorner.y, L.bottomRightCorner.y].map((y) => y / scan);
    const left = Math.max(0, Math.min(...xs));
    const top = Math.max(0, Math.min(...ys));
    const right = Math.min(bitmap.width, Math.max(...xs));
    const bottom = Math.min(bitmap.height, Math.max(...ys));
    const side = Math.max(right - left, bottom - top); // square
    const border = side * 0.08;

    // 4. draw only that square onto white, about 800 px, sharp edges
    const out = 800;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingEnabled = side < out; // only smooth when making it bigger
    const pad = (border / (side + border * 2)) * out;
    const inner = out - pad * 2;
    ctx.drawImage(bitmap, left, top, right - left, bottom - top, pad, pad, ((right - left) / side) * inner, ((bottom - top) / side) * inner);
    bitmap.close();

    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/png"));
    return { blob, name: merchantName(hit.data) };
}

// EMV QR = blocks of [2-digit id][2-digit length][value]. Id 59 = the merchant's name.
function merchantName(payload: string): string | null {
    let i = 0;
    while (i + 4 <= payload.length) {
        const id = payload.slice(i, i + 2);
        const len = Number(payload.slice(i + 2, i + 4));
        if (!Number.isFinite(len)) return null;
        if (id === "59") return payload.slice(i + 4, i + 4 + len).trim() || null;
        i += 4 + len;
    }
    return null;
}
