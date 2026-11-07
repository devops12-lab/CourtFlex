import { useState } from "react";
import type { Court, CourtInput } from "@courtflex/api";
import { Button, Field, Input, Segmented, Select, useOnline } from "@courtflex/ui";
import { FormError, fieldError } from "../../shared/FormFeedback";

export const surfaces = ["Acrylic", "Sport tile", "Concrete", "Asphalt", "Wood", "Other"];

export const courtStatusLabels: Record<Court["status"], string> = {
  active: "Open for booking",
  maintenance: "Under maintenance",
  inactive: "Inactive",
};

const blank: CourtInput = {
  name: "",
  court_code: "",
  indoor_outdoor: "outdoor",
  surface_type: "Acrylic",
  base_price: "",
  status: "active",
};

/** Court details, used both to add a court and to edit one. */
export function CourtForm({
  initial,
  submitLabel,
  pending,
  error,
  disabled,
  onSubmit,
}: {
  initial?: Court;
  submitLabel: string;
  pending: boolean;
  error: Error | null;
  disabled?: boolean;
  onSubmit: (input: CourtInput) => void;
}) {
  const online = useOnline();
  const [v, setV] = useState<CourtInput>(
    initial
      ? {
          name: initial.name,
          court_code: initial.court_code,
          indoor_outdoor: initial.indoor_outdoor,
          surface_type: initial.surface_type,
          base_price: initial.base_price.replace(/\.00$/, ""),
          status: initial.status,
        }
      : blank,
  );
  const set = <K extends keyof CourtInput>(key: K, value: CourtInput[K]) =>
    setV((x) => ({ ...x, [key]: value }));

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...v, base_price: v.base_price.trim() });
      }}
    >
      <fieldset disabled={disabled} className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
          <Field label="Name" hint="What players and staff call it." error={fieldError(error, "name")}>
            {(p) => (
              <Input
                {...p}
                value={v.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Court 4"
              />
            )}
          </Field>
          <Field label="Code" hint="Short label." error={fieldError(error, "court_code")}>
            {(p) => (
              <Input
                {...p}
                value={v.court_code}
                maxLength={6}
                onChange={(e) => set("court_code", e.target.value.toUpperCase())}
                placeholder="C4"
              />
            )}
          </Field>
        </div>
        <Segmented
          label="Indoor or outdoor"
          value={v.indoor_outdoor}
          onChange={(x) => set("indoor_outdoor", x)}
          options={[
            { value: "outdoor", label: "Outdoor" },
            { value: "indoor", label: "Indoor or covered" },
          ]}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Surface" error={fieldError(error, "surface_type")}>
            {(p) => (
              <Select {...p} value={v.surface_type} onChange={(e) => set("surface_type", e.target.value)}>
                {surfaces.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Base rate per hour"
            hint="Used whenever no price rule applies."
            error={fieldError(error, "base_price")}
          >
            {(p) => (
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-line-dim">
                  ₱
                </span>
                <Input
                  {...p}
                  inputMode="decimal"
                  className="pl-7 font-condensed"
                  value={v.base_price}
                  onChange={(e) => set("base_price", e.target.value)}
                  placeholder="300"
                />
              </div>
            )}
          </Field>
        </div>
        <Field
          label="Status"
          hint={
            v.status === "active"
              ? "Players can find and book it."
              : "Hidden from players and can't be booked. Past bookings stay on record."
          }
          error={fieldError(error, "status")}
        >
          {(p) => (
            <Select
              {...p}
              value={v.status}
              onChange={(e) => set("status", e.target.value as Court["status"])}
            >
              {(Object.keys(courtStatusLabels) as Court["status"][]).map((s) => (
                <option key={s} value={s}>
                  {courtStatusLabels[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </fieldset>
      <FormError error={error} fields={["name", "court_code", "surface_type", "base_price", "status"]} />
      {!disabled && (
        <div>
          <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!online}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
