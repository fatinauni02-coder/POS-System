"use client"; // needs useState for the "are you sure?" step

import { useState } from "react";
import { deleteStockItem } from "./actions";

export function DeleteStockButton({ name }: { name: string }) {
    const [sure, setSure] = useState(false);

    return sure ? (
        <>
            <button type="button" onClick={() => setSure(false)} className="h-11 rounded-xl bg-tint px-4 font-semibold">
                Keep
            </button>
            {/* formAction = send THIS form to a different action than the form's own (Save) */}
            <button formAction={deleteStockItem} className="h-11 rounded-xl bg-red-700 px-4 font-bold text-white">
                Delete {name}
            </button>
        </>
    ) : (
        <button type="button" onClick={() => setSure(true)} className="ml-auto h-11 rounded-xl px-4 font-semibold text-red-700 hover:bg-red-50">
            Delete
        </button>
    );
}