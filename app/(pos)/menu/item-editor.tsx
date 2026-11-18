"use client"; // needs the browser: useState updates while the manager types

import { useState } from "react";

import { saveItem } from "./actions";
import { SubmitButton } from "@/components/submit-button";

type Props = {
    item: { id: number | null; name: string; description: string | null; price: number | string; category_id: string | null };
categories: { id: string; name: string } [];
};

// RIGHT-SIDE EDITOR on /menu. id = null means "new item".
export function ItemEditor({ item, categories }: Props) {
    // state = values that change while the manager types
    const [name, setName] = useState(item.name);
    const [price, setPrice] = useState(item.id ? Number(item.price).toFixed(2) : "");

    // price must look like 12 or 12.5 or 12.50, and be more than 0
    const priceOk = /^\d+(\.\d{1,2})?$/.test(price) && Number(price) > 0;
    const canSave = name.trim() !== "" && priceOk;

    return (
        // FORM: flex-col gap-4 = fields stacked with space between; p-5 = space inside the box
        // action={saveItem} = on submit, the Server Action in actions.ts saves it
        <form action={saveItem} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="id" value={item.id ?? ""} />

            {/* TITLE: small label + big name (truncate = cut with "…" if too long) */}
            <div>
                <span className="label-caps rounded bg-tint px-1.5 py-0.5 text-ink-2">{item.id ? "Editing item" : "New item"}</span>
                <h2 className="mt-1 truncate text-2xl font-bold">{name || "Untitled item"}</h2>
            </div>

            {/* ONE FIELD = label text + input. All inputs share the same look:
                mt-1 = gap under the label; h-12 = input height; w-full = full width
                rounded-xl = corners; bg-tint = light orange fill; px-4 = text inset
                outline-none focus:ring-2 focus:ring-primary = orange ring while typing */}
            <label className="block">
                <span className="text-sm font-semibold text-ink-2">Item name</span>
                <input
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                    className="mt-1 h-12 w-full rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary-soft"
                />
            </label>

            {/* PRICE + CATEGORY side by side: grid-cols-2 = 2 equal columns, gap-3 = space between
                (change to grid-cols-1 to stack them) */}
            <div className="grid grid-cols-2 gap-3">
                <label className="block">
                    <span className="text-sm font-semibold text-ink-2">Price (RM)</span>
                    {/* inputMode="decimal" = tablets show the number keyboard */}
                    <input
                        name="price"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        inputMode="decimal"
                        className="mt-1 h-12 w-full rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary-soft"
                    />
                </label>
                <label className="block">
                    <span className="text-sm font-semibold text-ink-2">Category</span>
                    <select
                        name="category_id"
                        defaultValue={item.category_id ?? ""}
                        className="mt-1 h-12 w-full rounded-xl bg-tint px-3 font-semibold outline-none focus:ring-2 focus:ring-primary-soft"
                    >
                        <option value="">No category</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {/* red warning under the price, only while the price is wrong */}
            {!priceOk && <p className="text-sm font-semibold text-danger">Enter a price like 12.50</p>}

            {/* DESCRIPTION: rows={2} = 2 lines tall; p-4 = inner space */}
            <label className="block">
                <span className="text-sm font-semibold text-ink-2">Description</span>
                <textarea
                    name="description"
                    defaultValue={item.description ?? ""}
                    rows={2}
                    maxLength={120}
                    className="mt-1 w-full rounded-xl bg-tint p-4 outline-none focus:ring-2 focus:ring-primary-soft"
                />
            </label>

            {/* SAVE BUTTON: h-12 = height; faded (opacity-40) and not clickable until name + price are OK */}
            <SubmitButton disabled={!canSave} className="btn-primary h-12">
                {item.id ? "Save changes" : "Add item"}
            </SubmitButton>
        </form>
    );
}
