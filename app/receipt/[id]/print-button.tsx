"use client"; // window.print() only exists in the browser

export function PrintButton({ label = "Print receipt" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="h-12 rounded-2xl bg-primary px-5 font-bold text-white print:hidden">
      {label}
    </button>
  );
}