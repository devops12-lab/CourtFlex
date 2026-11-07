import { useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, Plus, X } from "lucide-react";
import type { CourtDetail, OperatingHours, PriceRuleInput, Weekday } from "@courtflex/api";
import { formatMoney, useCourt, useSaveCourtHours, useSavePriceRules, useUpdateCourt } from "@courtflex/api";
import { Button, cn, ErrorState, Input, Select, Skeleton, Tabs, useOnline, useToast } from "@courtflex/ui";
import { useClubContext } from "../../app/club-context";
import { FormError, ReadOnlyNote, fieldError } from "../../shared/FormFeedback";
import { halfHours, weekdays } from "../../shared/time-options";
import { CourtForm, courtStatusLabels } from "./CourtForm";

type Tab = "details" | "hours" | "rates";

export function CourtDetailPage() {
  const { courtId } = useParams();
  const { club } = useClubContext();
  const court = useCourt(club.id, courtId);
  const [tab, setTab] = useState<Tab>("details");

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to=".."
        relative="path"
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Courts
      </Link>

      {court.isPending && <Skeleton className="mt-4 h-64" />}
      {court.error && (
        <div className="mt-4">
          <ErrorState message={court.error.message} onRetry={() => court.refetch()} />
        </div>
      )}
      {court.data && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-expanded font-bold sm:text-3xl">{court.data.name}</h1>
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-sm border px-2 text-xs font-semibold",
                court.data.status === "active"
                  ? "border-line/60"
                  : "border-dashed border-signal-amber text-signal-amber",
              )}
            >
              {courtStatusLabels[court.data.status]}
            </span>
          </div>
          <div className="mt-4">
            <ReadOnlyNote />
          </div>
          <Tabs
            className="mt-6"
            label={`${court.data.name} settings`}
            value={tab}
            onChange={setTab}
            items={[
              { value: "details", label: "Details" },
              { value: "hours", label: "Opening hours" },
              { value: "rates", label: "Rates" },
            ]}
          >
            {(t) =>
              t === "details" ? (
                <DetailsTab court={court.data} />
              ) : t === "hours" ? (
                <HoursTab key={court.data.id} court={court.data} />
              ) : (
                <RatesTab key={court.data.id} court={court.data} />
              )
            }
          </Tabs>
        </>
      )}
    </div>
  );
}

function DetailsTab({ court }: { court: CourtDetail }) {
  const { club, can } = useClubContext();
  const update = useUpdateCourt(club.id, court.id);
  const toast = useToast();
  return (
    <CourtForm
      key={court.id}
      initial={court}
      submitLabel="Save details"
      pending={update.isPending}
      error={update.error}
      disabled={!can("manageCourts") || club.read_only}
      onSubmit={(input) =>
        update.mutate(input, { onSuccess: (c) => toast({ tone: "success", message: `${c.name} saved.` }) })
      }
    />
  );
}

/** The weekly schedule. Bookings outside new hours block the save; the server lists them. */
function HoursTab({ court }: { court: CourtDetail }) {
  const { club, can } = useClubContext();
  const save = useSaveCourtHours(club.id, court.id);
  const toast = useToast();
  const online = useOnline();
  const [hours, setHours] = useState<OperatingHours[]>(court.hours);
  const disabled = !can("manageCourtSchedules") || club.read_only;
  const day = (w: number) => hours.find((h) => h.weekday === w)!;
  const update = (w: number, patch: Partial<OperatingHours>) =>
    setHours((list) => list.map((h) => (h.weekday === w ? { ...h, ...patch } : h)));
  const monday = day(1);

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(hours, {
          onSuccess: () => toast({ tone: "success", message: `Opening hours for ${court.name} saved.` }),
        });
      }}
    >
      <p className="max-w-prose text-line-dim">
        Players can only book inside these hours. For a one-off closure, add it on the Courts page.
      </p>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Opening hours by day</legend>
        <ul className="border-t court-line">
          {weekdays.map((w) => {
            const h = day(w.value);
            const err = fieldError(save.error, `hours.${w.value}`);
            return (
              <li key={w.value} className="border-b court-line py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex w-36 cursor-pointer items-center gap-3 font-semibold">
                    <input
                      type="checkbox"
                      checked={!h.is_closed}
                      onChange={(e) =>
                        update(
                          w.value,
                          e.target.checked
                            ? {
                                is_closed: false,
                                opens_at: h.opens_at ?? "06:00",
                                closes_at: h.closes_at ?? "22:00",
                              }
                            : { is_closed: true },
                        )
                      }
                      className="size-4 accent-[var(--color-line)]"
                    />
                    {w.label}
                  </label>
                  {h.is_closed ? (
                    <span className="text-line-dim">Closed all day</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <TimeSelect
                        label={`${w.label} opens`}
                        value={h.opens_at}
                        onChange={(v) => update(w.value, { opens_at: v })}
                      />
                      <span className="text-line-dim">to</span>
                      <TimeSelect
                        label={`${w.label} closes`}
                        value={h.closes_at}
                        onChange={(v) => update(w.value, { closes_at: v })}
                      />
                    </span>
                  )}
                </div>
                {err && <p className="mt-1 text-sm text-signal-red">{err}</p>}
              </li>
            );
          })}
        </ul>
      </fieldset>
      <FormError error={save.error} fields={weekdays.map((w) => `hours.${w.value}`)} />
      {!disabled && (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary" size="lg" loading={save.isPending} disabled={!online}>
            Save hours
          </Button>
          <Button
            size="lg"
            onClick={() => setHours((list) => list.map((h) => ({ ...monday, weekday: h.weekday })))}
          >
            Copy Monday to every day
          </Button>
        </div>
      )}
    </form>
  );
}

function TimeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-32 font-condensed"
    >
      {halfHours.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </Select>
  );
}

type DraftRule = PriceRuleInput & { key: number };

/**
 * Rates for parts of the day, such as a floodlight rate after 5 PM.
 * The server applies them; new rates only affect bookings made after saving.
 */
function RatesTab({ court }: { court: CourtDetail }) {
  const { club, can } = useClubContext();
  const save = useSavePriceRules(club.id, court.id);
  const toast = useToast();
  const online = useOnline();
  const disabled = !can("manageCourts") || club.read_only;
  const [rules, setRules] = useState<DraftRule[]>(() =>
    court.price_rules.map((r, i) => ({
      key: i,
      day_of_week: r.day_of_week,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      price: r.price.replace(/\.00$/, ""),
    })),
  );
  const [nextKey, setNextKey] = useState(rules.length);
  const update = (key: number, patch: Partial<PriceRuleInput>) =>
    setRules((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          rules.map(({ key: _key, ...r }) => r),
          {
            onSuccess: () =>
              toast({ tone: "success", message: `Rates for ${court.name} saved. New bookings use them.` }),
          },
        );
      }}
    >
      <div className="max-w-prose text-line-dim">
        <p>
          Outside these rates, {court.name} costs{" "}
          <strong className="font-semibold font-condensed text-line">{formatMoney(court.base_price)}</strong>{" "}
          an hour (the base rate, set under Details).
        </p>
        <p className="mt-2">
          A rate for one day replaces an every-day rate at the same time. Existing bookings keep their price.
        </p>
      </div>

      <fieldset disabled={disabled} className="flex flex-col">
        <legend className="sr-only">Rates</legend>
        {rules.length === 0 && (
          <p className="border-y court-line py-4 text-line-dim">
            No extra rates. The base rate applies all day.
          </p>
        )}
        {rules.length > 0 && (
          <ol className="border-t court-line">
            {rules.map((r, i) => {
              const err = fieldError(save.error, `rules.${i}`);
              return (
                <li key={r.key} className="border-b court-line py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      aria-label={`Rate ${i + 1} days`}
                      value={r.day_of_week === null ? "all" : String(r.day_of_week)}
                      onChange={(e) =>
                        update(r.key, {
                          day_of_week: e.target.value === "all" ? null : (Number(e.target.value) as Weekday),
                        })
                      }
                      className="h-10 w-36"
                    >
                      <option value="all">Every day</option>
                      {weekdays.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </Select>
                    <TimeSelect
                      label={`Rate ${i + 1} from`}
                      value={r.starts_at}
                      onChange={(v) => update(r.key, { starts_at: v })}
                    />
                    <span className="text-line-dim">to</span>
                    <TimeSelect
                      label={`Rate ${i + 1} until`}
                      value={r.ends_at}
                      onChange={(v) => update(r.key, { ends_at: v })}
                    />
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-line-dim">
                        ₱
                      </span>
                      <Input
                        aria-label={`Rate ${i + 1} per hour`}
                        inputMode="decimal"
                        value={r.price}
                        onChange={(e) => update(r.key, { price: e.target.value })}
                        className="h-10 w-28 pl-7 font-condensed"
                      />
                    </div>
                    <span className="text-sm text-line-dim">/h</span>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => setRules((list) => list.filter((x) => x.key !== r.key))}
                        className="grid size-10 place-items-center rounded-sm text-line-dim hover:bg-court-raised hover:text-line"
                        aria-label={`Remove rate ${i + 1}`}
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  {err && <p className="mt-1 text-sm text-signal-red">{err}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </fieldset>

      <FormError error={save.error} fields={rules.map((_, i) => `rules.${i}`)} />
      {!disabled && (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary" size="lg" loading={save.isPending} disabled={!online}>
            Save rates
          </Button>
          <Button
            size="lg"
            onClick={() => {
              setRules((list) => [
                ...list,
                {
                  key: nextKey,
                  day_of_week: null,
                  starts_at: "17:00",
                  ends_at: "22:00",
                  price: court.base_price.replace(/\.00$/, ""),
                },
              ]);
              setNextKey((k) => k + 1);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add rate
          </Button>
        </div>
      )}
    </form>
  );
}
