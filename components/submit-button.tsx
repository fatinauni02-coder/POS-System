"use client"; // useFormStatus only works in the browser

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

// small turning circle; it takes the colour of the text around it (border-current)
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.15em] ${className}`}
    />
  );
}

type Props = ComponentProps<"button"> & {
  spinner?: boolean; // false = no circle, just greyed out (e.g. on/off switches)
  replace?: boolean; // true = show ONLY the circle while saving (small icon buttons like ×)
};

// A submit button for a <form action={serverAction}>.
// While the form is being sent: the button is disabled and shows a spinner, so nobody presses twice.
// A form with 2 buttons (Receive / Waste, name="reason"): only the one you pressed spins.
export function SubmitButton({ children, className = "", spinner = true, replace = false, name, value, disabled, ...rest }: Props) {
  const { pending, data } = useFormStatus(); // pending = this form is being sent right now
  const mine = pending && (!name || data?.get(name) === String(value)); // was it THIS button?

  return (
    <button
      {...rest}
      name={name}
      value={value}
      disabled={disabled || pending}
      aria-busy={mine}
      className={`${className} ${pending ? "cursor-wait opacity-70" : ""}`}
    >
      {mine && spinner && replace ? (
        <Spinner />
      ) : (
        <>
          {mine && spinner && <Spinner className="mr-1.5 h-4 w-4" />}
          {children}
        </>
      )}
    </button>
  );
}
