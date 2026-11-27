"use client"; // window.print() only exists in the browser

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// AUTO-PRINT: opened with "?auto=1" right after Pay / Send to kitchen.
// Prints the docs in `docs` (e.g. ["receipt"] or ["bar", "kitchen"]) in ONE go,
// each on its own piece of paper, then takes ?auto=1 out of the address
// so pressing refresh doesn't print again.
// (The browser still shows its print box. To print with no box, start Chrome with
//  --kiosk-printing on the till computer.)
export function AutoPrint({ docs }: { docs: string[] }) {
    const router = useRouter();
    const path = usePathname();
    const params = useSearchParams();

    useEffect(() => {
        if (params.get("auto") !== "1") return;
        const rest = new URLSearchParams(params);
        rest.delete("auto");
        const clean = `${path}${rest.size ? `?${rest}` : ""}`;
        if (docs.length === 0) return router.replace(clean, { scroll: false });

        // mark the docs to print; globals.css shows only those while printing (body.print-some)
        const picked = docs.flatMap((d) => Array.from(document.querySelectorAll<HTMLElement>(`[data-doc="${d}"]`)));
        picked.forEach((el) => el.classList.add("print-pick"));
        document.body.classList.add("print-some");
        const cleanUp = () => {
            document.body.classList.remove("print-some");
            picked.forEach((el) => el.classList.remove("print-pick"));
        };
        window.addEventListener("afterprint", cleanUp, { once: true });

        // a moment for the page (fonts) to settle, then print
        const timer = setTimeout(() => {
            window.print();
            router.replace(clean, { scroll: false });
        }, 400);
        return () => clearTimeout(timer);
    }, [docs, params, path, router]);

    return null;
}
