import { ManagerOnly } from "@/components/manager-only";

// /staff = owners and managers only (staff are sent back to the Order screen)
export default function Layout({ children }: { children: React.ReactNode }) {
    return <ManagerOnly>{children}</ManagerOnly>;
}
