"use client"; // needs useState for the "are you sure?" step

import { useState } from "react";
import { deleteStockItem } from "./actions";

export function DeleteStockButton({ name }: { name: string }) {
    const [sure, setSure] = useState(false);

    return sure ? (
        <>
            <button type="button" onClick={() => setSure(false)} className="btn-soft h-12 px-4">
                Keep
            </button>
            {/* formAction = send THIS form to a different action than the form's own (Save) */}
            <button formAction={deleteStockItem} className="press h-12 rounded-xl bg-danger px-4 font-bold text-white">
                Delete {name}
            </button>
        </>
    ) : (
        <button type="button" onClick={() => setSure(true)} className="press h-12 rounded-xl px-3 font-semibold text-danger hover:bg-danger/10">
            Delete
        </button>
    );
}