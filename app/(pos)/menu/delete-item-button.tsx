"use client"; // needs useState for the "are you sure?" step

import { Archive } from "lucide-react";
import { useState } from "react";
import { deleteItem } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export function DeleteItemButton({ id, name }: { id: number; name: string }) {
    const [sure, setSure] = useState(false); // false = first tap not done yet

    return (
        <form action={deleteItem} className="border-t border-line p-5">
            <input type="hidden" name="id" value={id} />
            {sure ? (
                // second step: Cancel or really delete
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setSure(false)} className="btn-soft h-12">
                        Cancel
                    </button>
                    <SubmitButton className="press h-12 truncate rounded-xl bg-danger px-2 font-bold text-white">Delete {name}</SubmitButton>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setSure(true)}
                    className="press flex h-12 items-center gap-1.5 rounded-xl px-3 font-semibold text-danger hover:bg-danger/10"
                >
                    <Archive className="h-4 w-4" />
                    Delete item
                </button>
            )}
        </form>
    );
}