"use client"; // window.print() only exists in the browser

import { Printer } from "lucide-react";

// prints what's on the screen (the sidebar, buttons etc. have print:hidden)
export function PrintButton({ label = "Print receipt", className }: { label?: string; className?: string }) {
  return (
    <button onClick={() => window.print()} className={className ?? "h-12 rounded-2xl bg-primary px-5 font-bold text-white print:hidden"}>
      {className && <Printer className="h-5 w-5" />}
      {label}
    </button>
  );
}

// PRINT ALL: the receipt + every ticket, one after another (each on its own paper).
// It adds the class "print-all" to <body> while printing; globals.css then shows the hidden docs.
export function PrintAllButton({ sub }: { sub: string }) {
  function printAll() {
    document.body.classList.add("print-all");
    window.addEventListener("afterprint", () => document.body.classList.remove("print-all"), { once: true });
    window.print();
  }
  return (
    <button type="button" onClick={printAll} className="card press flex h-20 items-center gap-3 px-6 text-left hover:bg-tint print:hidden">
      <Printer className="h-7 w-7 text-primary" />
      <span>
        <span className="block text-xl font-bold">Print all</span>
        <span className="text-sm text-ink-2">{sub}</span>
      </span>
    </button>
  );
}
