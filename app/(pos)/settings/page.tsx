import { Armchair, Check, CircleCheck, Coffee, LayoutGrid, Lock, LockKeyhole, Percent, Receipt, Save, Settings, Store } from "lucide-react";
import Link from "next/link";
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

// the sections on the left; "?tab=tax" = which one is open
const TABS = [
  { id: "business", label: "Business profile", Icon: Store },
  { id: "tax", label: "Tax (SST)", Icon: Percent },
  { id: "receipt", label: "Receipt", Icon: Receipt },
  { id: "service", label: "Service style", Icon: Armchair },
  { id: "security", label: "Manager PIN", Icon: LockKeyhole },
] as const;
type Tab = (typeof TABS)[number]["id"];

// the same look for every text box
const INPUT = "mt-1 h-12 w-full rounded-xl bg-tint px-4 font-semibold outline-none focus:ring-2 focus:ring-primary-soft";

async function SettingsForm({ searchParams }: { searchParams: PageProps<"/settings">["searchParams"] }) {
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === params.tab) ? (params.tab as Tab) : "business";
  const business = await getBusiness();
  if (!business) return <p className="p-6 text-danger">Shop not found</p>;
  const hasPin = await hasManagerPin(business.id);

  // every section of the settings form is ON the page (so Save sends all of them);
  // the ones not picked are only hidden
  const show = (id: Tab) => (tab === id ? "" : "hidden");

  return (
    <div className="flex flex-col">
      {params.saved && <Toast key={String(params.t)} kind="msg" text="Saved ✓" />}
      {typeof params.error === "string" && <Toast key={String(params.t)} kind="error" text={params.error} />}
      {params.pin === "changed" && <Toast key={String(params.t)} kind="msg" text="PIN changed ✓" />}
      {typeof params.pinError === "string" && <Toast key={String(params.t)} kind="error" text={params.pinError} />}

      {/* HEADER — the buttons sit outside the form, so form="settings" links them to it */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-6 py-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tint text-primary">
          <Settings className="h-6 w-6" />
        </span>
        <div className="mr-auto">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            Settings
            <span className="label-caps flex items-center gap-1 rounded-md bg-tint px-2 py-1 text-ink-2">
              <Lock className="h-3 w-3" />
              Manager
            </span>
          </h1>
          <p className="text-sm text-ink-2">Business details, tax, receipt and service style</p>
        </div>
        {tab !== "security" && (
          <>
            {/* type="reset" = put every box back to what was saved */}
            <button type="reset" form="settings" className="btn-soft h-12 px-5">
              Discard
            </button>
            <button form="settings" className="btn-primary flex h-12 items-center gap-2 px-6">
              <Save className="h-5 w-5" />
              Save settings
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-5 p-6 lg:flex-row">
        {/* LEFT: sections */}
        <nav aria-label="Settings sections" className="card flex shrink-0 gap-1 self-start overflow-x-auto p-2 lg:w-64 lg:flex-col lg:p-3">
          {TABS.map(({ id, label, Icon }) => (
            <Link
              key={id}
              href={id === "business" ? "/settings" : `/settings?tab=${id}`}
              aria-current={tab === id ? "page" : undefined}
              className={`press flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 font-semibold whitespace-nowrap ${
                tab === id ? "bg-primary-soft text-on-primary" : "hover:bg-tint"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1">
          {/* THE SETTINGS FORM (one form for every section except the PIN) */}
          <form id="settings" action={saveSettings}>
            <input type="hidden" name="tab" value={tab} />

            <div className={show("business")}>
              <Section title="Business profile" desc="Shown in the top bar and on every receipt.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Business name">
                    <input name="name" defaultValue={business.name} required maxLength={60} className={INPUT} />
                  </Field>
                  <Field label="Tagline" hint="Under the name in the top bar">
                    <input name="tagline" defaultValue={business.tagline ?? ""} maxLength={80} className={INPUT} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Address" hint="Printed on the receipt">
                      <input name="address" defaultValue={business.address ?? ""} maxLength={200} className={INPUT} />
                    </Field>
                  </div>
                  <Field label="Phone">
                    <input name="phone" type="tel" defaultValue={business.phone ?? ""} maxLength={30} className={INPUT} />
                  </Field>
                </div>
              </Section>
            </div>

            <div className={show("tax")}>
              <Section title="Tax (SST)" desc="Service Tax is charged on the subtotal after discount, rounded to the nearest sen.">
                <div className="space-y-4">
                  <SwitchRow
                    name="sst_registered"
                    on={business.sst_registered}
                    title="SST registered"
                    desc="Turn off if the business isn't registered for SST. No tax line will be charged or printed."
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="SST rate (%)" hint="Usually 6% for F&B service tax (8% for some services)">
                      <input
                        name="sst_rate"
                        type="number"
                        min={0}
                        max={20}
                        step={0.01}
                        defaultValue={Number(business.sst_rate)}
                        className={`money ${INPUT}`}
                      />
                    </Field>
                    <Field label="SST registration no." hint="Printed on receipts">
                      <input name="sst_reg_no" defaultValue={business.sst_reg_no ?? ""} maxLength={40} className={INPUT} />
                    </Field>
                  </div>
                </div>
              </Section>
            </div>

            <div className={show("receipt")}>
              <Section title="Receipt" desc="What prints on the 80mm receipt.">
                <Field label="Footer message" hint="Printed above “Thank you!”">
                  <input
                    name="receipt_footer"
                    defaultValue={business.receipt_footer ?? ""}
                    maxLength={200}
                    placeholder="e.g. Follow us @kopico"
                    className={INPUT}
                  />
                </Field>
              </Section>
            </div>

            <div className={show("service")}>
              <Section title="Service style" desc="How orders flow in your shop. You can switch any time; open table bills are kept.">
                <div className="grid gap-4 md:grid-cols-2">
                  <ModeCard
                    value="cafe"
                    on={business.service_mode !== "restaurant"}
                    Icon={Coffee}
                    title="Cafe · direct order"
                    desc="Order and pay at the counter"
                    points={["Order screen opens straight away", "Customer pays before the food is made", "Dine-in or takeaway with an optional table number"]}
                  />
                  <ModeCard
                    value="restaurant"
                    on={business.service_mode === "restaurant"}
                    Icon={LayoutGrid}
                    title="Restaurant · table layout"
                    desc="Seat, order, eat, pay at the end"
                    points={["Tables screen shows free and occupied tables", "Send items to the kitchen in rounds (add-ons)", "Pay the whole bill when the table leaves"]}
                  />
                </div>
              </Section>
            </div>
          </form>

          {/* MANAGER PIN: its own form + its own Server Action */}
          <form action={changePin} className={show("security")}>
            <Section title="Manager PIN" desc={hasPin ? "Needed for refunds and discounts. Enter the current PIN to change it." : "No PIN yet — set one here."}>
              <div className="grid gap-4 sm:grid-cols-3">
                {hasPin && (
                  <Field label="Current PIN">
                    <input name="current" type="password" inputMode="numeric" maxLength={6} required autoComplete="off" className={INPUT} />
                  </Field>
                )}
                <Field label="New PIN" hint="4 to 6 digits">
                  <input name="next" type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} required autoComplete="new-password" className={INPUT} />
                </Field>
                <Field label="New PIN again">
                  <input name="again" type="password" inputMode="numeric" maxLength={6} required autoComplete="new-password" className={INPUT} />
                </Field>
              </div>
              <button className="btn-primary mt-5 flex h-12 items-center gap-2 px-6">
                <LockKeyhole className="h-5 w-5" />
                {hasPin ? "Change PIN" : "Set PIN"}
              </button>
            </Section>
          </form>
        </main>
      </div>
    </div>
  );
}

// a white card with a title + one line under it
function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="text-xl font-bold">{title}</h2>
      {desc && <p className="mt-0.5 text-sm text-ink-2">{desc}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

// label text above a box, small hint under it
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

// a real checkbox, drawn as an on/off switch (group-has-[:checked] = "when the box inside is ticked")
function SwitchRow({ name, on, title, desc }: { name: string; on: boolean; title: string; desc: string }) {
  return (
    <label className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-line p-4">
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="text-sm text-ink-2">{desc}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={on} className="peer sr-only" />
      <span className="relative h-8 w-14 shrink-0 rounded-full bg-line transition peer-focus-visible:ring-2 peer-focus-visible:ring-primary-soft group-has-[:checked]:bg-success">
        <span className="absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-all group-has-[:checked]:left-7" />
      </span>
    </label>
  );
}

// a radio button drawn as a big card (Cafe / Restaurant)
function ModeCard({
  value,
  on,
  Icon,
  title,
  desc,
  points,
}: {
  value: string;
  on: boolean;
  Icon: typeof Coffee;
  title: string;
  desc: string;
  points: string[];
}) {
  return (
    <label className="group press cursor-pointer rounded-2xl border-2 border-line p-5 hover:bg-tint has-[:checked]:border-primary-soft has-[:checked]:bg-tint">
      <input type="radio" name="service_mode" value={value} defaultChecked={on} className="sr-only" />
      <span className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-tint text-primary group-has-[:checked]:bg-primary group-has-[:checked]:text-on-primary">
          <Icon className="h-6 w-6" />
        </span>
        <span className="flex-1">
          <span className="block text-lg font-bold">{title}</span>
          <span className="text-sm text-ink-2">{desc}</span>
        </span>
        <CircleCheck className="hidden h-6 w-6 text-primary group-has-[:checked]:block" />
      </span>
      <ul className="mt-4 space-y-1.5 text-sm">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {p}
          </li>
        ))}
      </ul>
    </label>
  );
}
