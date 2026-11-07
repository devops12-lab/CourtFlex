import { useState, type ReactNode } from "react";
import type { ClubUpdateInput, WalletAccount } from "@courtflex/api";
import { useUpdateClub } from "@courtflex/api";
import { Button, cn, Field, Input, Segmented, Select, Textarea, useOnline, useToast } from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";
import { NotFoundPage } from "../clubs/NotFoundPage";
import { ImagePicker } from "@courtflex/features";
import { FormError, ReadOnlyNote, fieldError } from "../../shared/FormFeedback";

const fieldNames = [
  "name",
  "tagline",
  "description",
  "rules",
  "logo_url",
  "cover_url",
  "settings.open_play_cancellation_hours",
  "contact_phone",
  "contact_email",
  "address",
  "settings.default_slot_minutes",
  "settings.booking_window_days",
  "settings.player_cancellation_hours",
  "settings.cancellation_policy",
  "settings.payment_instructions",
  "settings.booking_payments",
  "settings.booking_payments.gcash.account_name",
  "settings.booking_payments.gcash.account_number",
  "settings.booking_payments.gcash.qr_url",
  "settings.booking_payments.maya.account_name",
  "settings.booking_payments.maya.account_number",
  "settings.booking_payments.maya.qr_url",
];

export function SettingsPage() {
  const { club, can } = useClubContext();
  if (!can("updateClub")) return <NotFoundPage message="Only the venue owner can change venue settings." />;
  return <SettingsForm key={club.id} />;
}

function SettingsForm() {
  const { club } = useClubContext();
  const update = useUpdateClub(club.id);
  const toast = useToast();
  const online = useOnline();
  const [v, setV] = useState<ClubUpdateInput>({
    name: club.name,
    tagline: club.tagline,
    description: club.description,
    rules: club.rules,
    logo_url: club.logo_url,
    cover_url: club.cover_url,
    contact_phone: club.contact_phone,
    contact_email: club.contact_email,
    address: club.address,
    settings: { ...club.settings },
  });
  const set = <K extends keyof ClubUpdateInput>(key: K, value: ClubUpdateInput[K]) =>
    setV((x) => ({ ...x, [key]: value }));
  const pay = v.settings.booking_payments;
  const setPay = (next: Partial<ClubUpdateInput["settings"]["booking_payments"]>) =>
    setRule("booking_payments", { ...v.settings.booking_payments, ...next });
  const setRule = <K extends keyof ClubUpdateInput["settings"]>(
    key: K,
    value: ClubUpdateInput["settings"][K],
  ) => setV((x) => ({ ...x, settings: { ...x.settings, [key]: value } }));
  const err = (f: string) => fieldError(update.error, f);
  const disabled = club.read_only;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-expanded font-bold sm:text-3xl">Venue settings</h1>
      <p className="mt-1 max-w-prose text-line-dim">
        What players see about {club.name}, and the rules bookings follow.
      </p>
      <div className="mt-4">
        <ReadOnlyNote />
      </div>

      <form
        noValidate
        className="mt-8 flex flex-col gap-12"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(v, { onSuccess: () => toast({ tone: "success", message: "Venue settings saved." }) });
        }}
      >
        <fieldset disabled={disabled} className="flex flex-col gap-12">
          <Section title="Venue profile" note="Shown on your venue page and in court search results.">
            <Field label="Venue name" error={err("name")}>
              {(p) => <Input {...p} value={v.name} onChange={(e) => set("name", e.target.value)} />}
            </Field>
            <Field
              label="One line about the venue"
              hint="Shown on your directory card."
              error={err("tagline")}
            >
              {(p) => (
                <Input
                  {...p}
                  maxLength={90}
                  value={v.tagline}
                  onChange={(e) => set("tagline", e.target.value)}
                />
              )}
            </Field>
            <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
              <ImagePicker
                label="Logo"
                value={v.logo_url}
                onChange={(x) => set("logo_url", x)}
                disabled={disabled}
                error={err("logo_url")}
              />
              <ImagePicker
                label="Cover image"
                hint="Without one, your card shows a court drawing."
                shape="wide"
                value={v.cover_url}
                onChange={(x) => set("cover_url", x)}
                disabled={disabled}
                error={err("cover_url")}
              />
            </div>
            <Field
              label="Description"
              hint="One or two sentences: courts, parking, paddle rental."
              error={err("description")}
            >
              {(p) => (
                <Textarea {...p} value={v.description} onChange={(e) => set("description", e.target.value)} />
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Phone" error={err("contact_phone")}>
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    value={v.contact_phone}
                    onChange={(e) => set("contact_phone", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Email (optional)" error={err("contact_email")}>
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    value={v.contact_email}
                    onChange={(e) => set("contact_email", e.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label="Street address" error={err("address")}>
              {(p) => <Input {...p} value={v.address} onChange={(e) => set("address", e.target.value)} />}
            </Field>
            <p className="text-sm text-line-dim">
              {club.city}, {club.province}. The city and province decide which local rankings your matches
              count toward, so changing them needs a support request.
            </p>
          </Section>

          <Section title="Bookings">
            <Toggle
              label="Take walk-in bookings"
              description="Front desk can book players who show up without a reservation."
              checked={v.settings.allow_walk_ins}
              onChange={(c) => setRule("allow_walk_ins", c)}
            />
            <Toggle
              label="Take bookings in the app"
              description="Players can book your courts online. Off: your venue is still listed, marked not bookable yet."
              checked={v.settings.allow_online_booking}
              onChange={(c) => setRule("allow_online_booking", c)}
            />
            <Toggle
              label="Let people book without an account"
              description="Guests give their name, mobile and email, and confirm with a code sent to that email. They find their booking with its code and email."
              checked={v.settings.allow_guest_booking}
              disabled={!v.settings.allow_online_booking}
              onChange={(c) => setRule("allow_guest_booking", c)}
            />
            <Toggle
              label="Accept part payments"
              description="Staff can record less than the full balance, for example a deposit."
              checked={v.settings.allow_partial_payments}
              onChange={(c) => setRule("allow_partial_payments", c)}
            />
            <Segmented
              label="Booking length step"
              value={String(v.settings.default_slot_minutes) as "30" | "60" | "90"}
              onChange={(m) => setRule("default_slot_minutes", Number(m))}
              options={[
                { value: "30", label: "30 min" },
                { value: "60", label: "1 hour" },
                { value: "90", label: "1.5 hours" },
              ]}
            />
            <Field label="Players can book up to" error={err("settings.booking_window_days")}>
              {(p) => (
                <Select
                  {...p}
                  value={v.settings.booking_window_days}
                  onChange={(e) => setRule("booking_window_days", Number(e.target.value))}
                  className="sm:w-60"
                >
                  {[3, 7, 14, 30, 60].map((d) => (
                    <option key={d} value={d}>
                      {d} days ahead
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Players can cancel a booking in the app up to"
              hint="After that, the app asks them to call you."
              error={err("settings.player_cancellation_hours")}
            >
              {(p) => (
                <Select
                  {...p}
                  value={v.settings.player_cancellation_hours}
                  onChange={(e) => setRule("player_cancellation_hours", Number(e.target.value))}
                  className="sm:w-60"
                >
                  {[0, 2, 6, 12, 24, 48, 72].map((h) => (
                    <option key={h} value={h}>
                      {h === 0 ? "Until it starts" : `${h} hours before`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Cancellation policy"
              hint="Players see this before they book and when they cancel. Say what happens after the deadline."
              error={err("settings.cancellation_policy")}
            >
              {(p) => (
                <Textarea
                  {...p}
                  value={v.settings.cancellation_policy}
                  onChange={(e) => setRule("cancellation_policy", e.target.value)}
                />
              )}
            </Field>
            <Field
              label="How to pay at the venue"
              hint="Shown on every booking confirmation. Payments are made on site, never in the app."
              error={err("settings.payment_instructions")}
            >
              {(p) => (
                <Textarea
                  {...p}
                  value={v.settings.payment_instructions}
                  onChange={(e) => setRule("payment_instructions", e.target.value)}
                />
              )}
            </Field>
          </Section>

          <Section
            title="Payments for app bookings"
            note="How players pay when they book in the app. GCash and Maya hold the court for 30 minutes while the player uploads a receipt; your staff check it under Receipts to check on the Today page."
          >
            {err("settings.booking_payments") && (
              <p role="alert" className="text-sm text-signal-red">
                {err("settings.booking_payments")}
              </p>
            )}
            <Toggle
              label="Pay at the court"
              description="The booking is confirmed straight away; staff record the payment at the desk."
              checked={pay.pay_at_court}
              onChange={(c) => setPay({ pay_at_court: c })}
            />
            {(["gcash", "maya"] as const).map((key) => (
              <WalletSettings
                key={key}
                label={key === "gcash" ? "GCash" : "Maya"}
                value={pay[key]}
                onChange={(w) => setPay({ [key]: w })}
                err={(f) => err(`settings.booking_payments.${key}.${f}`)}
              />
            ))}
            <Toggle
              label="Require payment before play"
              description="Players must pay by GCash or Maya when they book. Pay at the court isn't offered in the app."
              checked={pay.require_prepayment}
              disabled={!pay.gcash && !pay.maya}
              onChange={(c) => setPay({ require_prepayment: c })}
            />
          </Section>

          <Section title="Venue rules">
            <Field label="Venue rules" hint="Shown on your venue page." error={err("rules")}>
              {(p) => <Textarea {...p} value={v.rules} onChange={(e) => set("rules", e.target.value)} />}
            </Field>
          </Section>

          <Section title="Open play">
            <Field
              label="Players can cancel a registration up to"
              hint="After that, they need to message the host."
              error={err("settings.open_play_cancellation_hours")}
            >
              {(p) => (
                <Select
                  {...p}
                  value={v.settings.open_play_cancellation_hours}
                  onChange={(e) => setRule("open_play_cancellation_hours", Number(e.target.value))}
                  className="sm:w-60"
                >
                  {[0, 1, 3, 6, 12, 24, 48].map((h) => (
                    <option key={h} value={h}>
                      {h === 0 ? "Until it starts" : `${h} ${h === 1 ? "hour" : "hours"} before`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Toggle
              label="Players can host open play"
              description="Players create sessions and reserve a court here. Your rates and hours still apply."
              checked={v.settings.allow_player_open_play}
              onChange={(c) => setRule("allow_player_open_play", c)}
            />
            <Toggle
              label="Approve sessions before they're public"
              description="New player sessions wait for staff approval before others can join."
              checked={v.settings.require_open_play_approval && v.settings.allow_player_open_play}
              disabled={!v.settings.allow_player_open_play}
              onChange={(c) => setRule("require_open_play_approval", c)}
            />
          </Section>
        </fieldset>

        <FormError error={update.error} fields={fieldNames} />
        {!disabled && (
          <div className="sticky bottom-20 z-10 -mx-4 border-t court-line bg-court-deep/95 px-4 py-4 backdrop-blur md:bottom-0">
            <Button type="submit" variant="primary" size="lg" loading={update.isPending} disabled={!online}>
              Save settings
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t-2 border-line pt-5">
      <div>
        <h2 className="text-xl font-expanded font-bold">{title}</h2>
        {note && <p className="mt-1 text-sm text-line-dim">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** A labelled on/off switch built on a checkbox, so it works with any form and screen reader. */
function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-6",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-line-dim">{description}</span>
      </span>
      <span className="relative mt-1 inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            "h-6 w-11 rounded-full border-2 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ball",
            checked ? "border-line bg-line" : "border-line-faint bg-court-deep",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "absolute top-1 left-1 size-4 rounded-full transition-transform",
            checked ? "translate-x-5 bg-court-deep" : "bg-line-dim",
          )}
        />
      </span>
    </label>
  );
}

/** One e-wallet for app bookings: on or off, with the account players send money to. */
function WalletSettings({
  label,
  value,
  onChange,
  err,
}: {
  label: string;
  value: WalletAccount | null;
  onChange: (w: WalletAccount | null) => void;
  err: (field: string) => string | undefined;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-line-faint p-4">
      <Toggle
        label={label}
        description={`Players send the court fee to your ${label} account and upload the receipt.`}
        checked={!!value}
        onChange={(c) => onChange(c ? { account_name: "", account_number: "", qr_url: null } : null)}
      />
      {value && (
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <Field label={`${label} account name`} error={err("account_name")}>
            {(p) => (
              <Input
                {...p}
                value={value.account_name}
                onChange={(e) => onChange({ ...value, account_name: e.target.value })}
              />
            )}
          </Field>
          <Field label={`${label} number`} error={err("account_number")}>
            {(p) => (
              <Input
                {...p}
                type="tel"
                inputMode="numeric"
                placeholder="09171234567"
                className="font-condensed"
                value={value.account_number}
                onChange={(e) => onChange({ ...value, account_number: e.target.value })}
              />
            )}
          </Field>
          <ImagePicker
            label="QR code (optional)"
            value={value.qr_url}
            onChange={(x) => onChange({ ...value, qr_url: x })}
            error={err("qr_url")}
          />
        </div>
      )}
    </div>
  );
}
