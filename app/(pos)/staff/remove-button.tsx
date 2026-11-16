"use client"; // needs useState for the "are you sure?" step

import { useState } from "react";
import { removeStaff } from "./actions";

// two taps to remove someone (same idea as Delete item on the Menu page)
export function RemoveButton({ userId, name }: { userId: string; name: string }) {
    const [sure, setSure] = useState(false);

    return (
        <form action={removeStaff} className="flex gap-2">
            <input type="hidden" name="user_id" value={userId} />
            {sure ? (
                <>
                    <button type="button" onClick={() => setSure(false)} className="h-10 rounded-xl bg-tint px-3 text-sm font-semibold">
                        Cancel
                    </button>
                    <button className="h-10 max-w-48 truncate rounded-xl bg-red-700 px-3 text-sm font-bold text-white">Remove {name}</button>
                </>
            ) : (
                <button type="button" onClick={() => setSure(true)} className="h-10 rounded-xl px-3 text-sm font-semibold text-red-700 hover:bg-red-50">
                    Remove…
                </button>
            )}
        </form>
    );
}
