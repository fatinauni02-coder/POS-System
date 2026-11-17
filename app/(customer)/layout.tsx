// CUSTOMER LAYOUT — the QR ordering pages on the customer's phone.
// No sidebar, no top bar, no staff links: customers only see the menu and their own order.
// (The staff frame lives in app/(pos)/layout.tsx; proxy.ts lets only "/order/…" through without login.)
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
    return <div className="mx-auto min-h-dvh max-w-xl bg-canvas">{children}</div>;
}
