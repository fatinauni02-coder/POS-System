import { ManagerOnly } from "@/components/manager-only";

export default function Layout({ children }: { children: React.ReactNode }) {
    return <ManagerOnly>{children}</ManagerOnly>;
}