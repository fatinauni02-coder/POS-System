"use client";

import { useState } from "react";

import { DISCOUNTS } from "@/lib/money";
import { approveDiscount } from "./actions";

type Props = {
  onApproved: (pct: number, token: string) => void;
  onClose: () => void;
};

// Pop-up: pick 10 / 20 / 50 %, manager types the PIN, server approves
export function DiscountPanel({ onApproved, onClose }: Props) {
  const [pct, setPct] = useState(DISCOUNTS[0]);
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    setSaving(true);
    setError("");
    const result = await approveDiscount(pct, pin);
    setSaving(false);
    if (result.ok) {
      onApproved(pct, result.token);
    } else {
      setError(result.message);
      setPin("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">Discount</h2>

        {/* the % buttons, one row */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {DISCOUNTS.map((d) => (
            <button
              key={d}
              onClick={() => setPct(d)}
              className={`h-12 rounded-xl font-bold ${pct === d ? "bg-primary text-white" : "border border-line bg-surface"}`}
            >
              {d}%
            </button>
          ))}
        </div>

        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          placeholder="Manager PIN"
          className="mt-4 h-14 w-full rounded-xl bg-tint px-4 text-center text-2xl tracking-[0.5em] outline-none placeholder:text-base placeholder:tracking-normal focus:ring-2 focus:ring-primary"
        />

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={onClose} className="h-12 rounded-2xl bg-tint font-semibold">
            Cancel
          </button>
          <button
            onClick={approve}
            disabled={pin.length < 4 || saving}
            className="h-12 rounded-2xl bg-primary font-bold text-white disabled:opacity-40"
          >
            {saving ? "Checking…" : `Give ${pct}% off`}
          </button>
        </div>
      </div>
    </div>
  );
}