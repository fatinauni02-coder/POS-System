import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInCard } from "@/components/sign-in-card";

// "/admin/login" — sits OUTSIDE app/admin/ (in the (auth) group), so no sidebar / top bar here
export const metadata: Metadata = { title: "Admin sign in" };

export default function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-canvas p-4">
            <Suspense>
                <Card searchParams={searchParams} />
            </Suspense>
        </div>
    );
}

async function Card({ searchParams }: { searchParams: PageProps<"/admin/login">["searchParams"] }) {
    const { error } = await searchParams;
    return <SignInCard portal="admin" error={typeof error === "string" ? error : undefined} />;
}
