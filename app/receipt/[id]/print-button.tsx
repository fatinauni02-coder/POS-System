"use client"; // window.print() only exists in the browser

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="h-12 rounded-2xl bg-primary font-bold text-white">
      Print receipt
    </button>
  );
}