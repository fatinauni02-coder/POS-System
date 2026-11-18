"use client"; // listens to the keyboard

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// SPACE = the big "New order / Back to Table" button on the receipt page,
// so the cashier can go to the next customer without touching the screen.
// Ignored while typing in a box (e.g. the refund PIN) or while a pop-up is open.
export function NextKey({ href }: { href: string }) {
    const router = useRouter();

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName))) return;
            if (document.querySelector(".fixed.inset-0")) return; // a pop-up (refund) is open
            e.preventDefault(); // don't scroll the page
            router.push(href);
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [href, router]);

    return null;
}
