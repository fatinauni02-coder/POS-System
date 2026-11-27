import { FeatureGate } from "@/components/feature-gate";
import { ManagerOnly } from "@/components/manager-only";

// Stock: owners/managers only, and only merchants with "Stock" in their plan
export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <FeatureGate feature="stock">
            <ManagerOnly>{children}</ManagerOnly>
        </FeatureGate>
    );
}
