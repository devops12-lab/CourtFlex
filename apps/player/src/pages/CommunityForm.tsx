import { useState } from "react";
import type { ClubProfile, CommunityInput, WalletAccount } from "@courtflex/api";
import { ApiError, useClubDirectory } from "@courtflex/api";
import { Button, Field, Input, Segmented, Select, Textarea, useOnline } from "@courtflex/ui";
import { ImagePicker } from "@courtflex/features";

const STARTER_WAIVER = `Membership agreement

1. Sportsmanship. Play fair, call your own lines honestly and respect other players, hosts and venue staff.
2. Court safety. Wear non-marking court shoes. Pickleball carries a risk of injury; you play at your own risk and stop if you feel unwell.
3. Venue rules. Follow the rules of each venue the club plays at, including their hours and fees.
4. Fees. Membership fees cover the period of your plan and aren't refunded once it starts.
5. Conduct. Admins can suspend members who break these rules, with a reason.`;

const emptyWallet: WalletAccount = { account_name: "", account_number: "", qr_url: null };

/** The details of a community club, for starting one or editing it. */
export function CommunityForm({
  initial,
  pending,
  error,
  submitLabel,
  onSubmit,
}: {
  initial?: ClubProfile;
  pending: boolean;
  error: Error | null;
  submitLabel: string;
  onSubmit: (input: CommunityInput) => void;
}) {
  const online = useOnline();
  const venues = useClubDirectory({ type: "venue" });
  const [v, setV] = useState<CommunityInput>({
    name: initial?.name ?? "",
    tagline: initial?.tagline ?? "",
    description: initial?.description ?? "",
    city: initial?.city ?? "",
    province: initial?.province ?? "Quezon",
    home_venue_id: initial?.home_venue?.id ?? null,
    contact_email: initial?.contact_email ?? "",
    contact_phone: initial?.contact_phone ?? "",
    rules: initial?.rules ?? "",
    join_policy: initial?.join_policy ?? "open",
    cancellation_hours: initial?.cancellation_hours ?? 6,
    logo_url: initial?.logo_url ?? null,
    cover_url: initial?.cover_url ?? null,
    waiver: initial?.waiver || STARTER_WAIVER,
    payment_options: initial?.payment_options ?? {
      in_person: true,
      gcash: null,
      maya: null,
      instructions: "",
    },
  });
  const pay = v.payment_options;
  const setPay = (next: Partial<CommunityInput["payment_options"]>) =>
    set("payment_options", { ...v.payment_options, ...next });
  const set = <K extends keyof CommunityInput>(k: K, value: CommunityInput[K]) =>
    setV((x) => ({ ...x, [k]: value }));
  const err = (f: string) => (error instanceof ApiError ? error.field(f) : undefined);

  return (
    <form
      noValidate
      className="flex flex-col gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <section className="flex flex-col gap-5 border-t-2 border-line pt-5">
        <h2 className="text-xl font-expanded font-bold">The club</h2>
        <Field label="Club name" error={err("name")}>
          {(p) => (
            <Input
              {...p}
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Tara Pikol Mauban"
            />
          )}
        </Field>
        <Field
          label="One line about the club"
          hint="Shown on your card in the directory."
          error={err("tagline")}
        >
          {(p) => (
            <Input
              {...p}
              maxLength={90}
              value={v.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              placeholder="Friendly rallies after work"
            />
          )}
        </Field>
        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <ImagePicker
            label="Logo"
            value={v.logo_url}
            onChange={(x) => set("logo_url", x)}
            error={err("logo_url")}
          />
          <ImagePicker
            label="Cover image"
            hint="Optional. Without one, your card shows a court drawing."
            shape="wide"
            value={v.cover_url}
            onChange={(x) => set("cover_url", x)}
            error={err("cover_url")}
          />
        </div>
        <Field label="About the club">
          {(p) => (
            <Textarea
              {...p}
              value={v.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Who you are, when you play, who's welcome."
            />
          )}
        </Field>
      </section>

      <section className="flex flex-col gap-5 border-t-2 border-line pt-5">
        <h2 className="text-xl font-expanded font-bold">Where you play</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City or municipality" error={err("city")}>
            {(p) => (
              <Input
                {...p}
                value={v.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Mauban"
              />
            )}
          </Field>
          <Field label="Province" error={err("province")}>
            {(p) => <Input {...p} value={v.province} onChange={(e) => set("province", e.target.value)} />}
          </Field>
        </div>
        <Field
          label="Usual venue (optional)"
          hint="Shown on your club card. You can host sessions at any venue that allows it."
          error={err("home_venue_id")}
        >
          {(p) => (
            <Select
              {...p}
              value={v.home_venue_id ?? ""}
              onChange={(e) => set("home_venue_id", e.target.value || null)}
            >
              <option value="">No usual venue</option>
              {venues.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}, {x.city}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact phone (optional)">
            {(p) => (
              <Input
                {...p}
                type="tel"
                value={v.contact_phone}
                onChange={(e) => set("contact_phone", e.target.value)}
              />
            )}
          </Field>
          <Field label="Contact email (optional)" error={err("contact_email")}>
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
      </section>

      <section className="flex flex-col gap-5 border-t-2 border-line pt-5">
        <h2 className="text-xl font-expanded font-bold">House rules</h2>
        <Segmented
          label="How people join"
          value={v.join_policy}
          onChange={(x) => set("join_policy", x)}
          options={[
            { value: "open", label: "Anyone can join" },
            { value: "approval", label: "I approve each member" },
          ]}
        />
        <Field label="Players can cancel a session up to" error={err("cancellation_hours")}>
          {(p) => (
            <Select
              {...p}
              value={v.cancellation_hours}
              onChange={(e) => set("cancellation_hours", Number(e.target.value))}
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
        <Field label="Club rules (optional)">
          {(p) => (
            <Textarea
              {...p}
              value={v.rules}
              onChange={(e) => set("rules", e.target.value)}
              placeholder="Paddle stack rotation. Call your own lines."
            />
          )}
        </Field>
      </section>

      <section className="flex flex-col gap-5 border-t-2 border-line pt-5">
        <h2 className="text-xl font-expanded font-bold">Joining and payments</h2>
        <Field
          label="Membership agreement"
          hint="New members read this and sign it when they join. Edit the starter text to fit your club."
          error={err("waiver")}
        >
          {(p) => (
            <Textarea {...p} rows={10} value={v.waiver} onChange={(e) => set("waiver", e.target.value)} />
          )}
        </Field>
        <fieldset className="flex flex-col gap-4">
          <legend className="text-sm font-medium">How members pay for paid plans</legend>
          {err("payment_options") && <p className="text-sm text-signal-red">{err("payment_options")}</p>}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={pay.in_person}
              onChange={(e) => setPay({ in_person: e.target.checked })}
              className="mt-1 size-4 accent-[var(--color-ball)]"
            />
            <span>
              <span className="block font-semibold">In person</span>
              <span className="block text-sm text-line-dim">
                They pay an admin at a session, and the admin records it.
              </span>
            </span>
          </label>
          {(["gcash", "maya"] as const).map((key) => (
            <WalletFields
              key={key}
              label={key === "gcash" ? "GCash" : "Maya"}
              value={pay[key]}
              onChange={(w) => setPay({ [key]: w })}
              err={(f) => err(`${key}_${f}`)}
            />
          ))}
          <Field
            label="Payment notes (optional)"
            hint="Shown with your accounts, for example who to hand cash to."
            error={err("payment_instructions")}
          >
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                maxLength={300}
                value={pay.instructions}
                onChange={(e) => setPay({ instructions: e.target.value })}
              />
            )}
          </Field>
        </fieldset>
      </section>

      {error && !(error instanceof ApiError && error.status === 422) && (
        <p role="alert" className="border-l-2 border-signal-red pl-3 text-sm">
          {error.message}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!online}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** One e-wallet: on or off, with the account members send money to. */
function WalletFields({
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
    <div className="rounded-md border border-line-faint p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked ? emptyWallet : null)}
          className="mt-1 size-4 accent-[var(--color-ball)]"
        />
        <span>
          <span className="block font-semibold">{label}</span>
          <span className="block text-sm text-line-dim">
            Members send money to this account and upload the receipt. An admin checks it before they're in.
          </span>
        </span>
      </label>
      {value && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <Field label={`${label} account name`} error={err("name")}>
            {(p) => (
              <Input
                {...p}
                value={value.account_name}
                onChange={(e) => onChange({ ...value, account_name: e.target.value })}
              />
            )}
          </Field>
          <Field label={`${label} number`} error={err("number")}>
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
            error={err("qr")}
          />
        </div>
      )}
    </div>
  );
}
