import { useState } from "react";
import type { PlatformSettings } from "@courtflex/api";
import { ApiError, usePlatformSettings, useSavePlatformSettings } from "@courtflex/api";
import { Button, Field, Input, Segmented, Skeleton, useToast } from "@courtflex/ui";

export function SettingsPage() {
  const q = usePlatformSettings();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-expanded sm:text-4xl">Settings</h1>
        <p className="mt-1 text-line-dim">
          Rules for the whole platform. Changes are recorded in the audit log.
        </p>
      </header>
      {q.isPending ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <SettingsForm key={JSON.stringify(q.settings)} initial={q.settings} />
      )}
    </div>
  );
}

function SettingsForm({ initial }: { initial: PlatformSettings }) {
  const save = useSavePlatformSettings();
  const toast = useToast();
  const [v, setV] = useState({ ...initial, trial_days: String(initial.trial_days) });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          { ...v, trial_days: Number(v.trial_days) },
          { onSuccess: () => toast({ tone: "success", message: "Settings saved." }) },
        );
      }}
    >
      <section
        aria-labelledby="venues-h"
        className="flex flex-col gap-5 rounded-2xl border border-line-faint bg-court-surface p-5"
      >
        <h2 id="venues-h" className="text-lg font-expanded">
          New venues
        </h2>
        <Field
          label="Free trial length (days)"
          hint="7 to 60. Applies to venues approved from now on; trials already running keep their dates."
          error={err?.field("trial_days")}
        >
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              className="max-w-32 font-condensed"
              value={v.trial_days}
              onChange={(e) => setV({ ...v, trial_days: e.target.value.replace(/\D/g, "") })}
            />
          )}
        </Field>
        <div>
          <Segmented<"open" | "closed">
            label="Owner sign-up"
            value={v.venue_signups_open ? "open" : "closed"}
            onChange={(x) => setV({ ...v, venue_signups_open: x === "open" })}
            options={[
              { value: "open", label: "Open" },
              { value: "closed", label: "Paused" },
            ]}
            className="max-w-xs"
          />
          <p className="mt-1.5 text-sm text-line-dim">
            Paused: the owner sign-up page says CourtFlex isn't taking new venues, with your support contact.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="support-h"
        className="flex flex-col gap-5 rounded-2xl border border-line-faint bg-court-surface p-5"
      >
        <h2 id="support-h" className="text-lg font-expanded">
          Support contact
        </h2>
        <p className="-mt-2 text-sm text-line-dim">
          Shown to suspended players and to owners of suspended or declined venues, and when owner sign-up is
          paused.
        </p>
        <Field label="Support email" error={err?.field("support_email")}>
          {(p) => (
            <Input
              {...p}
              type="email"
              value={v.support_email}
              onChange={(e) => setV({ ...v, support_email: e.target.value })}
            />
          )}
        </Field>
        <Field label="Support phone" error={err?.field("support_phone")}>
          {(p) => (
            <Input
              {...p}
              type="tel"
              value={v.support_phone}
              onChange={(e) => setV({ ...v, support_phone: e.target.value })}
            />
          )}
        </Field>
      </section>

      {err && !["trial_days", "support_email", "support_phone"].some((k) => err.field(k)) && (
        <p role="alert" className="text-sm text-signal-red">
          {err.message}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-fit" loading={save.isPending}>
        Save settings
      </Button>
    </form>
  );
}
