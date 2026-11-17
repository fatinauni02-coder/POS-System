// Payment methods the POS knows (shared by the checkout pop-up and Settings).
// Plain file (not "use client"), so server pages can import it too.
export type Method = "cash" | "card" | "duitnow" | "ewallet";

export const METHODS: { id: Method; label: string }[] = [
    { id: "cash", label: "Cash" },
    { id: "card", label: "Card" },
    { id: "duitnow", label: "DuitNow QR" },
    { id: "ewallet", label: "E-wallet" },
];
