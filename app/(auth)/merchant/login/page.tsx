import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInCard } from "@/components/sign-in-card";

// "/merchant/login" — sits OUTSIDE app/merchant/ (in the (auth) group), so no sidebar / top bar here
export const metadata: Metadata = { title: "Merchant sign in" };

export default function MerchantLoginPage({ searchParams }: PageProps<"/merchant/login">) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-canvas p-4">
            <Suspense>
                <Card searchParams={searchParams} />
            </Suspense>
        </div>
    );
}

async function Card({ searchParams }: { searchParams: PageProps<"/merchant/login">["searchParams"] }) {
    const { error } = await searchParams;
    return <SignInCard portal="merchant" error={typeof error === "string" ? error : undefined} />;
}
