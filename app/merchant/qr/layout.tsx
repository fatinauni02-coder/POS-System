import { FeatureGate } from "@/components/feature-gate";

// QR board: only merchants with "QR ordering & customer app" in their plan
export default function Layout({ children }: { children: React.ReactNode }) {
    return <FeatureGate feature="qr">{children}</FeatureGate>;
}
