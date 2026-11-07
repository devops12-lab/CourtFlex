import { useState } from "react";
import type { HomeLocation } from "@courtflex/api";
import { useGeo } from "@courtflex/api";
import { Field, Select } from "@courtflex/ui";

/**
 * Region → province → city or municipality → barangay. Each list loads once
 * the one above is chosen; the saved value is the barangay's standard code.
 */
export function LocationPicker({
  initial,
  value,
  onChange,
  error,
}: {
  initial?: HomeLocation | null;
  value: string | null;
  onChange: (barangayId: string | null) => void;
  error?: string;
}) {
  const [region, setRegion] = useState(initial?.region.id ?? "");
  const [province, setProvince] = useState(initial?.province.id ?? "");
  const [city, setCity] = useState(initial?.city.id ?? "");
  const regions = useGeo("regions", null);
  const provinces = useGeo("provinces", region || null);
  const cities = useGeo("cities", province || null);
  const barangays = useGeo("barangays", city || null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">Country: Philippines</p>
      <Field label="Region">
        {(p) => (
          <Select
            {...p}
            value={region}
            onChange={(e) => (setRegion(e.target.value), setProvince(""), setCity(""), onChange(null))}
          >
            <option value="">Choose a region</option>
            {regions.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Province">
        {(p) => (
          <Select
            {...p}
            value={province}
            disabled={!region}
            onChange={(e) => (setProvince(e.target.value), setCity(""), onChange(null))}
          >
            <option value="">{region ? "Choose a province" : "Choose a region first"}</option>
            {provinces.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="City or municipality">
        {(p) => (
          <Select
            {...p}
            value={city}
            disabled={!province}
            onChange={(e) => (setCity(e.target.value), onChange(null))}
          >
            <option value="">{province ? "Choose a city or municipality" : "Choose a province first"}</option>
            {cities.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Barangay" error={error}>
        {(p) => (
          <Select
            {...p}
            value={value ?? ""}
            disabled={!city}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">{city ? "Choose a barangay" : "Choose a city first"}</option>
            {barangays.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}
