"use client"; // listens in the browser

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

// LIVE UPDATES (migration 012): the database sends a tiny "changed" message on `topic`
// whenever a QR order changes; we then ask the server for the page again (router.refresh).
// The message has no order details — the page loads those itself, with the usual checks.
// fallbackSeconds: also refresh every so often, in case the live connection drops.
// beepOnNew: short "ding" when a NEW order arrives (for the staff board).
export function LiveRefresh({ topic, fallbackSeconds = 30, beepOnNew = false }: { topic: string; fallbackSeconds?: number; beepOnNew?: boolean }) {
    const router = useRouter();

    useEffect(() => {
        let wait: ReturnType<typeof setTimeout> | undefined;
        // several messages close together (accept = 2 changes) → only one refresh
        const refreshSoon = () => {
            clearTimeout(wait);
            wait = setTimeout(() => router.refresh(), 300);
        };

        const channel = supabase
            .channel(topic)
            .on("broadcast", { event: "changed" }, ({ payload }) => {
                if (beepOnNew && payload?.status === "new") beep();
                refreshSoon();
            })
            .subscribe();

        const timer = setInterval(() => router.refresh(), fallbackSeconds * 1000);
        return () => {
            clearTimeout(wait);
            clearInterval(timer);
            supabase.removeChannel(channel); // stop listening when the page closes
        };
    }, [router, topic, fallbackSeconds, beepOnNew]);

    return null;
}

// a short two-note "ding" made in the browser (no sound file needed).
// Browsers only allow sound after the person has tapped the page once.
function beep() {
    try {
        const ctx = new AudioContext();
        [880, 1320].forEach((hz, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = hz;
            gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + i * 0.15);
            osc.stop(ctx.currentTime + i * 0.15 + 0.3);
        });
        setTimeout(() => ctx.close(), 1000);
    } catch {
        // no sound on this device — the board still updates
    }
}
