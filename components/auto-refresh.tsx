"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// asks the server for the page again every few seconds (so the status updates by itself)
export function AutoRefresh({ seconds }: { seconds: number }) {
    const router = useRouter();
    useEffect(() => {
        const timer = setInterval(() => router.refresh(), seconds * 1000);
        return () => clearInterval(timer);
    }, [router, seconds]);
    return null;
}
