import { Suspense } from "react";
import { requireManager } from "@/lib/staff";

// wrap a section of the app: only owners/managers get past it
export function ManagerOnly({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Check>{children}</Check>
        </Suspense>
    );
}

async function Check({ children }: { children: React.ReactNode }) {
    await requireManager();
    return children;
}