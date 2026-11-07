import { useState } from "react";
import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";
import type { PlayFormat, PlayTime, PlayerProfile, SkillLevel } from "@courtflex/api";
import { ApiError, useProfile, useSaveLocation, useSaveProfile } from "@courtflex/api";
import {
  Button,
  cn,
  ErrorState,
  Field,
  Input,
  Segmented,
  Select,
  Skeleton,
  Textarea,
  useOnline,
  useToast,
} from "@courtflex/ui";
import { skillLabels } from "@courtflex/features";
import { LocationPicker } from "./LocationPicker";
import { skillDescriptions } from "./OnboardingPage";

export function EditProfilePage() {
  const profile = useProfile();
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/me"
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        My games
      </Link>
      <h1 className="mt-3 text-2xl font-expanded font-bold sm:text-3xl">Your profile</h1>
      <div className="mt-8">
        {profile.isPending && <Skeleton className="h-96" />}
        {profile.error && <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} />}
        {profile.data && (
          <div className="flex flex-col gap-12">
            <ProfileForm profile={profile.data} />
            <LocationForm profile={profile.data} />
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileForm({ profile }: { profile: PlayerProfile }) {
  const save = useSaveProfile();
  const toast = useToast();
  const online = useOnline();
  const [name, setName] = useState(profile.display_name);
  const [skill, setSkill] = useState<SkillLevel>(profile.skill_level);
  const [bio, setBio] = useState(profile.bio);
  const [formats, setFormats] = useState<PlayFormat[]>(profile.play_formats);
  const [times, setTimes] = useState<PlayTime[]>(profile.preferred_times);
  const [visibility, setVisibility] = useState(profile.visibility);
  const err = (f: string) => (save.error instanceof ApiError ? save.error.field(f) : undefined);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <form
      noValidate
      className="flex flex-col gap-5 border-t-2 border-line pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          {
            display_name: name,
            skill_level: skill,
            bio,
            play_formats: formats,
            preferred_times: times,
            visibility,
          },
          { onSuccess: () => toast({ tone: "success", message: "Profile saved." }) },
        );
      }}
    >
      <h2 className="text-xl font-expanded font-bold">About you</h2>
      <Field label="Name other players see" error={err("display_name")}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field
        label="Level"
        hint={skill !== "all" ? skillDescriptions[skill] : undefined}
        error={err("skill_level")}
      >
        {(p) => (
          <Select {...p} value={skill} onChange={(e) => setSkill(e.target.value as SkillLevel)}>
            {(Object.keys(skillDescriptions) as Array<keyof typeof skillDescriptions>).map((l) => (
              <option key={l} value={l}>
                {skillLabels[l]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="About you (optional)" hint="Up to 280 characters." error={err("bio")}>
        {(p) => <Textarea {...p} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} />}
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">You play</legend>
        <div className="flex flex-wrap gap-2">
          {(["doubles", "singles"] as PlayFormat[]).map((f) => (
            <Toggle key={f} on={formats.includes(f)} onClick={() => setFormats((x) => toggle(x, f))}>
              {f === "doubles" ? "Doubles" : "Singles"}
            </Toggle>
          ))}
          {(["morning", "afternoon", "evening"] as PlayTime[]).map((t) => (
            <Toggle key={t} on={times.includes(t)} onClick={() => setTimes((x) => toggle(x, t))}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </Toggle>
          ))}
        </div>
        {err("play_formats") && <p className="mt-1 text-sm text-signal-red">{err("play_formats")}</p>}
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
      <div>
        <Button type="submit" variant="primary" size="lg" loading={save.isPending} disabled={!online}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

function LocationForm({ profile }: { profile: PlayerProfile }) {
  const save = useSaveLocation();
  const toast = useToast();
  const online = useOnline();
  const [barangay, setBarangay] = useState<string | null>(profile.home?.barangay.id ?? null);
  const changed = barangay !== (profile.home?.barangay.id ?? null);
  return (
    <form
      noValidate
      className="flex flex-col gap-5 border-t-2 border-line pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (barangay)
          save.mutate(
            { barangay_id: barangay },
            { onSuccess: () => toast({ tone: "success", message: "Home location saved." }) },
          );
      }}
    >
      <h2 className="text-xl font-expanded font-bold">Home location</h2>
      <p className={cn("text-sm", profile.location_verified ? "text-line-dim" : "text-signal-amber")}>
        {profile.location_verified
          ? "Verified. Your games count toward your barangay, city, province and country rankings."
          : "Not verified yet. CourtFlex checks your home location before it counts for local rankings."}
        {changed && profile.location_verified ? " Changing it means it's checked again." : ""}
      </p>
      <LocationPicker
        initial={profile.home}
        value={barangay}
        onChange={setBarangay}
        error={save.error instanceof ApiError ? save.error.field("barangay_id") : undefined}
      />
      <div>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={save.isPending}
          disabled={!online || !barangay || !changed}
        >
          Save location
        </Button>
      </div>
    </form>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-10 rounded-full border px-4 text-sm font-semibold",
        on ? "border-line bg-line text-court-deep" : "border-line-faint text-line-dim hover:text-line",
      )}
    >
      {children}
    </button>
  );
}
