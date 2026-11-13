"use client"; // needs a timer + state

import { useEffect, useState } from "react";

// pop-up message at the bottom-right; hides by itself (errors stay longer)
export function Toast({ text, kind }: { text: string; kind: "msg" | "error" }) {
    const [show, setShow] = useState(true);

    useEffect(() => {
        // remove "?msg=…" from the address bar, so a refresh doesn't show it again
        window.history.replaceState(null, "", window.location.pathname);
        const timer = setTimeout(() => setShow(false), kind === "error" ? 6000 : 3000);
        return () => clearTimeout(timer); // clean up if the toast goes away first
    }, [kind]);

    if (!show) return null;

    return (
        // fixed = pinned to the screen corner; bottom-20 on phones so it sits above the bottom nav
        <div
            role="status"
            className={`fixed bottom-20 right-4 z-50 flex max-w-sm items-start gap-3 rounded-2xl p-4 font-semibold shadow-lg md:bottom-6 md:right-6 print:hidden ${
                kind === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"
            }`}
        >
            <span className="flex-1">{text}</span>
            <button type="button" onClick={() => setShow(false)} aria-label="Close" className="text-lg leading-none">
                ×
            </button>
        </div>
    );
}
