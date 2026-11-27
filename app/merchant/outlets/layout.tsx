import { FeatureGate } from "@/components/feature-gate";

// Outlets: only merchants with "Multiple outlets (HQ)" in their plan
export default function Layout({ children }: { children: React.ReactNode }) {
    return <FeatureGate feature="outlets">{children}</FeatureGate>;
}
