import { Suspense } from "react";

import { getBusiness } from "@/lib/business";
import { Toast } from "@/components/toast";
import { hasManagerPin } from "@/lib/pin";
import { changePin, saveSettings } from "./actions";
import { Loading } from "@/components/loading";

export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsForm searchParams={searchParams} />
    </Suspense>
  );
}

// the same look for every text box
const INPUT = "mt-1 h-12 w-full rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary";

async function SettingsForm({ searchParams }: { searchParams: PageProps<"/settings">["searchParams"] }) {
  const params = await searchParams;
  const business = await getBusiness();
  if (!business) return <p className="p-6 text-red-600">Shop not found</p>;
  const hasPin = await hasManagerPin(business.id);

  return (
    // the page column: 2 separate forms (a form can't be inside another form)
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
      {/* a normal HTML form: no useState needed — the Server Action reads the values with FormData */}
      <form action={saveSettings} className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-ink-2">Shop details, tax and receipt</p>
        </div>

        {params.saved && <Toast key={String(params.t)} kind="msg" text="Saved ✓" />}
        {typeof params.error === "string" && <Toast key={String(params.t)} kind="error" text={params.error} />}

        <Section title="Shop">
          <Field label="Shop name">
            <input name="name" defaultValue={business.name} required maxLength={60} className={INPUT} />
          </Field>
          <Field label="Tagline (top bar)">
            <input name="tagline" defaultValue={business.tagline ?? ""} maxLength={80} className={INPUT} />
          </Field>
          <Field label="Address (receipt)">
            <textarea name="address" defaultValue={business.address ?? ""} rows={2} maxLength={200} className={`${INPUT} h-auto py-3`} />
          </Field>
          <Field label="Phone (receipt)">
            <input name="phone" defaultValue={business.phone ?? ""} maxLength={30} className={INPUT} />
          </Field>
        </Section>

        <Section title="Tax (SST)">
          <label className="flex items-center gap-3">
            <input type="checkbox" name="sst_registered" defaultChecked={business.sst_registered} className="h-5 w-5 accent-primary" />
            <span className="font-semibold">Shop is SST-registered (add SST to every order)</span>
          </label>
          {/* 2 boxes side by side */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="SST rate (%)">
              <input name="sst_rate" type="number" min={0} max={20} step={0.01} defaultValue={Number(business.sst_rate)} className={INPUT} />
            </Field>
            <Field label="SST registration no.">
              <input name="sst_reg_no" defaultValue={business.sst_reg_no ?? ""} maxLength={40} className={INPUT} />
            </Field>
          </div>
        </Section>

        <Section title="Service style">
          <label className="flex items-start gap-3">
            <input type="radio" name="service_mode" value="cafe" defaultChecked={business.service_mode !== "restaurant"} className="mt-1 h-5 w-5 accent-primary" />
            <span>
              <span className="font-semibold">Cafe</span>
              <span className="block text-sm text-ink-2">Order and pay at the counter</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="radio" name="service_mode" value="restaurant" defaultChecked={business.service_mode === "restaurant"} className="mt-1 h-5 w-5 accent-primary" />
            <span>
              <span className="font-semibold">Restaurant</span>
              <span className="block text-sm text-ink-2">Tables: send orders to the kitchen in rounds, pay the bill at the end</span>
            </span>
          </label>
        </Section>

        <Section title="Receipt">
          <Field label="Message at the bottom">
            <textarea name="receipt_footer" defaultValue={business.receipt_footer ?? ""} rows={2} maxLength={200} className={`${INPUT} h-auto py-3`} />
          </Field>
        </Section>

        <button className="h-14 rounded-2xl bg-primary font-bold text-white">Save settings</button>
      </form>

      {/* MANAGER PIN: its own form + its own Server Action. id="pin" = the page jumps here after saving */}
      <form action={changePin} id="pin">
        <Section title="Manager PIN">
          <p className="text-sm text-ink-2">
            {hasPin ? "Needed for refunds. Enter the current PIN to change it." : "No PIN yet — set one here."}
          </p>
          {params.pin === "changed" && <Toast key={String(params.t)} kind="msg" text="PIN changed ✓" />}
          {typeof params.pinError === "string" && <Toast key={String(params.t)} kind="error" text={params.pinError} />}

          <div className="grid grid-cols-3 gap-3">
            {hasPin && (
              <Field label="Current PIN">
                <input name="current" type="password" inputMode="numeric" maxLength={6} required autoComplete="off" className={INPUT} />
              </Field>
            )}
            <Field label="New PIN">
              <input name="next" type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} required autoComplete="new-password" className={INPUT} />
            </Field>
            <Field label="New PIN again">
              <input name="again" type="password" inputMode="numeric" maxLength={6} required autoComplete="new-password" className={INPUT} />
            </Field>
          </div>
          <button className="h-12 rounded-2xl border-2 border-primary font-bold text-primary">Change PIN</button>
        </Section>
      </form>
    </div >
  );
}

// a white card with a title
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

// label text above a box
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink-2">{label}</span>
      {children}
    </label>
  );
}