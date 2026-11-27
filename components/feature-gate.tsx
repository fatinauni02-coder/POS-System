import { connection } from "next/server";
import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { requireFeature } from "@/lib/features";
import type { FeatureKey } from "@/lib/plans";

// wrap a section (in its layout.tsx): only merchants whose plan has this feature get past it
export function FeatureGate({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) {
    return (
        <Suspense fallback={<Loading />}>
            <Check feature={feature}>{children}</Check>
        </Suspense>
    );
}

async function Check({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) {
    await connection();
    await requireFeature(feature);
    return children;
}
