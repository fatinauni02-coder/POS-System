import { FeatureGate } from "@/components/feature-gate";

// Tables: only merchants with "Tables (restaurant mode)" in their plan
export default function Layout({ children }: { children: React.ReactNode }) {
    return <FeatureGate feature="tables">{children}</FeatureGate>;
}
