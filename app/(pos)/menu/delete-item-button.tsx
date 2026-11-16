"use client"; // needs useState for the "are you sure?" step

import { useState } from "react";
import { deleteItem } from "./actions";

export function DeleteItemButton({ id, name }: { id: number; name: string }) {
    const [sure, setSure] = useState(false); // false = first tap not done yet

    return (
        <form action={deleteItem} className="border-t border-line p-5">
            <input type="hidden" name="id" value={id} />
            {sure ? (
                // second step: Cancel or really delete
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setSure(false)} className="h-11 rounded-xl bg-tint font-semibold">
                        Cancel
                    </button>
                    <button className="h-11 truncate rounded-xl bg-red-700 px-2 font-bold text-white">Delete {name}</button>
                </div>
            ) : (
                <button type="button" onClick={() => setSure(true)} className="h-11 w-full rounded-xl font-semibold text-red-700 hover:bg-red-50">
                    Delete
                </button>
            )}
        </form>
    );
}