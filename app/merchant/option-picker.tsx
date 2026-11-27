"use client";

import { useState } from "react";

import { formatRM, toSen } from "@/lib/money";
import type { Group, Item, Option } from "./order-screen";

type Props = {
  item: Item;
  groups: Group[]; // only the groups THIS item uses
  onAdd: (chosen: Option[]) => void;
  onClose: () => void;
};

// Pop-up: choose Hot/Iced, milk… then "Add"
export function OptionPicker({ item, groups, onAdd, onClose }: Props) {
  // which option is picked in each group: { groupId: optionId }
  // required groups start on their first option (e.g. Hot), so the cashier can just tap Add
  const [picked, setPicked] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};
    for (const g of groups) {
      if (g.required && g.options[0]) start[g.id] = g.options[0].id;
    }
    return start;
  });

  function choose(group: Group, optionId: string) {
    setPicked((p) => {
      // optional group: tapping the chosen one again un-picks it
      if (!group.required && p[group.id] === optionId) {
        const next = { ...p };
        delete next[group.id];
        return next;
      }
      return { ...p, [group.id]: optionId };
    });
  }

  // the picked Option objects, and the price with extras
  const chosen = groups.flatMap((g) => g.options.filter((o) => o.id === picked[g.id]));
  const unitSen = toSen(item.price) + chosen.reduce((sum, o) => sum + toSen(o.price), 0);

  return (
    // DARK BACKGROUND (covers the whole screen); clicking it closes the pop-up
    // fixed inset-0 = stuck to all 4 screen edges, even if the page scrolls
    // z-50 = drawn on top of everything else
    // items-center justify-center = the white box sits in the middle
    // bg-black/40 = black at 40% (see-through); p-4 = keeps the box off the screen edges
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      {/* THE WHITE BOX; stopPropagation = clicks inside don't reach the background
          max-w-md = box width at most 448px (max-w-lg = wider, max-w-sm = narrower)
          w-full = but shrink on small screens; rounded-3xl = corners; p-6 = space inside */}
      <div className="w-full max-w-md rounded-3xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        {/* item name + base price */}
        <h2 className="text-xl font-bold">{item.name}</h2>
        <p className="text-ink-2">{formatRM(toSen(item.price))}</p>

        {/* ONE SECTION PER GROUP (Temperature, Milk…); mt-5 = space above each section */}
        {groups.map((g) => (
          <div key={g.id} className="mt-5">
            <p className="font-semibold">
              {g.name} <span className="text-sm font-normal text-ink-2">{g.required ? "(pick 1)" : "(optional)"}</span>
            </p>
            {/* OPTION BUTTONS: flex-wrap = go to a new line when the row is full; gap-2 = space between */}
            <div className="mt-2 flex flex-wrap gap-2">
              {g.options.map((o) => (
                // ONE OPTION: h-11 = height, px-4 = side padding; picked = orange, others = white with border
                <button
                  key={o.id}
                  onClick={() => choose(g, o.id)}
                  className={`h-11 rounded-2xl px-4 font-semibold ${
                    picked[g.id] === o.id ? "bg-primary text-white" : "border border-line bg-surface"
                  }`}
                >
                  {o.name}
                  {toSen(o.price) > 0 && ` +${formatRM(toSen(o.price))}`}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* BUTTONS: Cancel 1 part, Add 2 parts wide (same as the cart's Clear / Charge); h-14 = height */}
        <div className="mt-6 grid grid-cols-[1fr_2fr] gap-2">
          <button onClick={onClose} className="h-14 rounded-2xl bg-tint font-semibold">
            Cancel
          </button>
          <button onClick={() => onAdd(chosen)} className="h-14 rounded-2xl bg-primary font-bold text-white">
            Add · {formatRM(unitSen)}
          </button>
        </div>
      </div>
    </div>
  );
}