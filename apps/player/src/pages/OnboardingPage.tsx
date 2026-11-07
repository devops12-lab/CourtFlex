import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import type { PlayFormat, PlayTime, PlayerProfile, SkillLevel } from "@courtflex/api";
import { ApiError, useMe, useSaveLocation, useSaveProfile } from "@courtflex/api";
import { Button, cn, Field, Input, Segmented, Skeleton, useOnline } from "@courtflex/ui";
import { skillLabels } from "@courtflex/features";
import { joinAside, AuthShell } from "./auth/AuthShell";
import { LocationPicker } from "./LocationPicker";

export const skillDescriptions: Record<Exclude<SkillLevel, "all">, string> = {
  beginner: "New to pickleball, or still learning the rules.",
  novice: "You can rally and keep score. Working on consistency.",
  intermediate: "Comfortable dinking, dropping and moving up to the kitchen.",
  advanced: "Strong at the net. You play competitive games often.",
  pro: "Tournament level.",
};

const steps = ["About you", "Where you live", "How you play"] as const;

/** Three short steps before the first game: name and level, home barangay, preferences. */
export function OnboardingPage() {
  const me = useMe();
  const saveProfile = useSaveProfile();
  const saveLocation = useSaveLocation();
  const navigate = useNavigate();
  const online = useOnline();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [skill, setSkill] = useState<Exclude<SkillLevel, "all"> | null>(null);
  const [barangay, setBarangay] = useState<string | null>(null);
  const [formats, setFormats] = useState<PlayFormat[]>(["doubles"]);
  const [times, setTimes] = useState<PlayTime[]>([]);
  const [visibility, setVisibility] = useState<PlayerProfile["visibility"]>("public");

  if (me.isPending) return <Skeleton className="m-6 h-40" />;
  if (!me.data) return <Navigate to="/login" replace />;
  if (!me.data.email_verified) return <Navigate to="/verify" replace />;
  if (!me.data.needs_onboarding) return <Navigate to="/home" replace />;

  const displayName = name || me.data.name;
  const error = saveProfile.error ?? saveLocation.error;
  const err = (f: string) => (error instanceof ApiError ? error.field(f) : undefined);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const finish = () =>
    saveProfile.mutate(
      {
        display_name: displayName,
        skill_level: skill!,
        bio: "",
        play_formats: formats,
        preferred_times: times,
        visibility,
      },
      {
        onSuccess: () =>
          saveLocation.mutate(
            { barangay_id: barangay! },
            { onSuccess: () => navigate("/home", { replace: true }) },
          ),
      },
    );

  return (
    <AuthShell
      wide
      aside={joinAside}
      title="Set up your player profile"
      intro="Clubs and other players see this. You can change it later."
    >
      <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            <span className={cn("block h-1 rounded-full", i <= step ? "bg-line" : "bg-court-raised")} />
            <span
              className={cn("mt-2 block text-xs", i === step ? "font-semibold text-line" : "text-line-dim")}
            >
              {i + 1}. {s}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (displayName.trim().length >= 2 && skill) setStep(1);
          }}
        >
          <Field label="Name other players see" error={err("display_name")}>
            {(p) => <Input {...p} value={displayName} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Your level</legend>
            <div className="flex flex-col gap-2">
              {(Object.keys(skillDescriptions) as Array<keyof typeof skillDescriptions>).map((l) => (
                <label
                  key={l}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-sm border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ball",
                    skill === l ? "border-line bg-court-raised" : "border-line-faint hover:border-line/60",
                  )}
                >
                  <input
                    type="radio"
                    name="skill"
                    className="mt-1 size-4 accent-[var(--color-ball)]"
                    checked={skill === l}
                    onChange={() => setSkill(l)}
                  />
                  <span>
                    <span className="block font-semibold">{skillLabels[l]}</span>
                    <span className="block text-sm text-line-dim">{skillDescriptions[l]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={displayName.trim().length < 2 || !skill}
          >
            Next
          </Button>
        </form>
      )}

      {step === 1 && (
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (barangay) setStep(2);
          }}
        >
          <p className="text-sm text-line-dim">
            Used for courts near you and your barangay, city and province rankings. Other players see your
            city, not your barangay.
          </p>
          <LocationPicker value={barangay} onChange={setBarangay} error={err("barangay_id")} />
          <div className="flex gap-3">
            <Button type="submit" variant="primary" size="lg" className="flex-1" disabled={!barangay}>
              Next
            </Button>
            <Button size="lg" onClick={() => setStep(0)}>
              Back
            </Button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (formats.length) finish();
          }}
        >
          <fieldset>
            <legend className="mb-2 text-sm font-medium">You play</legend>
            <div className="flex gap-2">
              {(["doubles", "singles"] as PlayFormat[]).map((f) => (
                <Chip key={f} on={formats.includes(f)} onClick={() => setFormats((x) => toggle(x, f))}>
                  {f === "doubles" ? "Doubles" : "Singles"}
                </Chip>
              ))}
            </div>
            {err("play_formats") && <p className="mt-1 text-sm text-signal-red">{err("play_formats")}</p>}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Usually free (optional)</legend>
            <div className="flex flex-wrap gap-2">
              {(["morning", "afternoon", "evening"] as PlayTime[]).map((t) => (
                <Chip key={t} on={times.includes(t)} onClick={() => setTimes((x) => toggle(x, t))}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </Chip>
              ))}
            </div>
          </fieldset>
          <Segmented
            label="Who can see your profile and games"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: "public", label: "Everyone" },
              { value: "members", label: "My clubs" },
              { value: "private", label: "Only me" },
            ]}
          />
          {error && !(error instanceof ApiError && error.status === 422) && (
            <p role="alert" className="text-sm text-signal-red">
              {error.message}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="flex-1"
              loading={saveProfile.isPending || saveLocation.isPending}
              disabled={!online || formats.length === 0}
            >
              Start playing
            </Button>
            <Button size="lg" onClick={() => setStep(1)}>
              Back
            </Button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-11 rounded-full border px-5 text-sm font-semibold",
        on ? "border-line bg-line text-court-deep" : "border-line-faint text-line-dim hover:text-line",
      )}
    >
      {children}
    </button>
  );
}
