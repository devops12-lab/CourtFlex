import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Clock3,
  LocateFixed,
  MailCheck,
  MapPin,
  PartyPopper,
} from "lucide-react";
import type { OwnerSignupCourts, OwnerSignupResult } from "@courtflex/api";
import {
  ApiError,
  useMe,
  useOwnerSignup,
  useOwnerSignupCode,
  useVerifyOwnerCode,
  usePlatformSettings,
} from "@courtflex/api";
import { Button, cn, Field, Input, Segmented, Select, Skeleton, useOnline } from "@courtflex/ui";
import { pesos } from "@courtflex/features";
import { LocationPicker } from "./LocationPicker";
import type { Pin } from "../components/PinPicker";

const PinPicker = lazy(() => import("../components/PinPicker"));

const DRAFT = "courtflex-owner-signup";
const STEPS = ["Venue", "Your account", "Courts"] as const;
type Step = 0 | 1 | 2;

interface VenueDraft {
  name: string;
  pin: Pin | null;
  barangay_id: string | null;
  address: string;
  court_count: number;
  contact_phone: string;
  contact_email: string;
}
interface OwnerDraft {
  name: string;
  email: string;
}
interface Draft {
  step: Step;
  venue: VenueDraft;
  owner: OwnerDraft;
  courts: OwnerSignupCourts;
}

const fresh: Draft = {
  step: 0,
  venue: {
    name: "",
    pin: null,
    barangay_id: null,
    address: "",
    court_count: 2,
    contact_phone: "",
    contact_email: "",
  },
  owner: { name: "", email: "" },
  courts: { indoor_outdoor: "outdoor", opens_at: "06:00", closes_at: "22:00", hourly_rate: "300" },
};

/** Progress stays on this device until the account exists. Passwords and codes are never saved. */
function loadDraft(): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT) ?? "null") as Draft | null;
    // The barangay picker starts over: it needs its region, province and city chosen again.
    return saved
      ? { ...fresh, ...saved, venue: { ...fresh.venue, ...saved.venue, barangay_id: null } }
      : fresh;
  } catch {
    return fresh;
  }
}

const PHONE_RE = /^(\+?63|0)9\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIMES = Array.from({ length: 38 }, (_, i) => {
  const mins = 5 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${mins % 60 ? "30" : "00"}`;
});
const clock = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return `${h! % 12 === 0 ? 12 : h! % 12}:${String(m).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"}`;
};

type Errors = Partial<Record<string, string>>;

function venueProblems(v: VenueDraft): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 3) e["venue.name"] = "Enter the venue's name, as players will see it.";
  if (!v.pin) e["venue.pin"] = "Put the pin on your venue: tap the map, or use your location.";
  if (!v.barangay_id) e["venue.barangay_id"] = "Choose the venue's barangay.";
  if (!v.address.trim()) e["venue.address"] = "Enter the street, building or landmark.";
  if (!PHONE_RE.test(v.contact_phone.replace(/[\s-]/g, "")))
    e["venue.contact_phone"] = "Enter the venue's mobile number, like 09171234567.";
  if (v.contact_email.trim() && !EMAIL_RE.test(v.contact_email.trim()))
    e["venue.contact_email"] = "Enter a valid email, or leave it empty.";
  return e;
}

function courtProblems(c: OwnerSignupCourts): Errors {
  const e: Errors = {};
  if (c.closes_at <= c.opens_at) e["courts.closes_at"] = "Close after you open.";
  const r = Number(c.hourly_rate);
  if (!Number.isFinite(r) || r < 50 || r > 5000)
    e["courts.hourly_rate"] = "Enter an hourly rate from ₱50 to ₱5,000.";
  return e;
}

/**
 * The result of this visit's sign-up. Signing in swaps the site's layout, which
 * remounts this page; the same visit (same location key) shows the result again.
 */
let submitted: { key: string; result: OwnerSignupResult } | null = null;

/**
 * Owner sign-up: the venue, the owner's account (email confirmed by a code),
 * then the first courts. The venue waits for CourtFlex approval before players
 * can find it, and its free trial starts then.
 */
export function OwnerSignupPage() {
  const me = useMe();
  const signedIn = me.data ?? null;
  const { settings } = usePlatformSettings();
  const online = useOnline();
  const [d, setD] = useState<Draft>(loadDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const sendCode = useOwnerSignupCode();
  const verify = useVerifyOwnerCode();
  const signup = useOwnerSignup();
  const qc = useQueryClient();
  const { key } = useLocation();
  const [done, setDone] = useState<OwnerSignupResult | null>(() =>
    submitted?.key === key ? submitted.result : null,
  );

  useEffect(() => {
    if (!done) localStorage.setItem(DRAFT, JSON.stringify(d));
  }, [d, done]);

  const setVenue = (k: keyof VenueDraft, value: VenueDraft[keyof VenueDraft]) => {
    setD((x) => ({ ...x, venue: { ...x.venue, [k]: value } }));
    setErrors((e) => ({ ...e, [`venue.${k}`]: undefined }));
  };
  const setOwner = (k: keyof OwnerDraft, value: string) => {
    setD((x) => ({ ...x, owner: { ...x.owner, [k]: value } }));
    // A different email needs a new code.
    if (k === "email") {
      sendCode.reset();
      verify.reset();
      setCode("");
    }
  };
  const setCourts = (k: keyof OwnerSignupCourts, value: string) => {
    setD((x) => ({ ...x, courts: { ...x.courts, [k]: value } }));
    setErrors((e) => ({ ...e, [`courts.${k}`]: undefined }));
  };
  const go = (step: Step) => {
    setD((x) => ({ ...x, step }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const verified = !!signedIn || verify.isSuccess;
  const ownerProblems = (): Errors => {
    if (signedIn) return {};
    const e: Errors = {};
    if (d.owner.name.trim().length < 2) e["owner.name"] = "Enter your full name.";
    if (!EMAIL_RE.test(d.owner.email.trim())) e["owner.email"] = "Enter a valid email.";
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
      e["owner.password"] = "Use at least 8 characters with a letter and a number.";
    if (confirm !== password) e["owner.password_confirmation"] = "The passwords don't match.";
    if (!verified) e["owner.code"] = "Confirm your email with the code we send.";
    return e;
  };

  const next = () => {
    const e = d.step === 0 ? venueProblems(d.venue) : ownerProblems();
    setErrors(e);
    if (Object.keys(e).length) return;
    go((d.step + 1) as Step);
  };

  const submit = () => {
    const e = { ...venueProblems(d.venue), ...ownerProblems(), ...courtProblems(d.courts) };
    setErrors(e);
    const keys = Object.keys(e);
    if (keys.length)
      return go(
        keys.some((k) => k.startsWith("venue.")) ? 0 : keys.some((k) => k.startsWith("owner.")) ? 1 : 2,
      );
    signup.mutate(
      {
        venue: {
          name: d.venue.name.trim(),
          latitude: d.venue.pin!.lat,
          longitude: d.venue.pin!.lng,
          barangay_id: d.venue.barangay_id!,
          address: d.venue.address.trim(),
          court_count: d.venue.court_count,
          contact_phone: d.venue.contact_phone.trim(),
          contact_email: d.venue.contact_email.trim(),
        },
        courts: d.courts,
        owner: signedIn
          ? undefined
          : {
              name: d.owner.name.trim(),
              email: d.owner.email.trim(),
              password,
              password_confirmation: confirm,
              verification_id: sendCode.data!.verification_id,
            },
      },
      {
        onSuccess: (r) => {
          localStorage.removeItem(DRAFT);
          submitted = { key, result: r };
          setDone(r);
          // A new account is now signed in.
          void qc.invalidateQueries({ queryKey: ["me"] });
          window.scrollTo({ top: 0 });
        },
        onError: (err) => {
          if (!(err instanceof ApiError) || err.status !== 422) return;
          // The server checks everything again: show its messages and go back to the first step with a problem.
          const found: Errors = {};
          for (const k of [
            "venue.name",
            "venue.pin",
            "venue.barangay_id",
            "venue.address",
            "venue.court_count",
            "venue.contact_phone",
            "venue.contact_email",
            "owner.name",
            "owner.email",
            "owner.password",
            "owner.password_confirmation",
            "owner.code",
            "courts.indoor_outdoor",
            "courts.opens_at",
            "courts.closes_at",
            "courts.hourly_rate",
          ]) {
            const m = err.field(k);
            if (m) found[k] = m;
          }
          setErrors(found);
          const ks = Object.keys(found);
          if (ks.some((k) => k.startsWith("venue."))) go(0);
          else if (ks.some((k) => k.startsWith("owner."))) go(1);
        },
      },
    );
  };

  if (done) return <Submitted result={done} />;
  if (me.isPending) return <Skeleton className="mx-auto h-[36rem] max-w-3xl rounded-[28px]" />;
  if (!settings.venue_signups_open) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <h1 className="text-3xl leading-tight font-expanded sm:text-4xl">New venue sign-ups are paused</h1>
        <p className="mt-3 text-line-dim">
          CourtFlex isn't taking new venues right now. Please check back soon, or contact us at{" "}
          <a
            href={`mailto:${settings.support_email}`}
            className="font-semibold text-ball underline underline-offset-4"
          >
            {settings.support_email}
          </a>{" "}
          or {settings.support_phone}.
        </p>
        <Link to="/join" className="mt-8 inline-block font-semibold text-ball underline underline-offset-4">
          Back to Join CourtFlex
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-4 sm:py-8">
      <Link
        to="/join"
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Join CourtFlex
      </Link>
      <header className="mt-4">
        <p className="text-xs font-bold tracking-[0.16em] text-field uppercase">For venues</p>
        <h1 className="mt-2 text-3xl leading-tight font-expanded sm:text-5xl">
          List your venue on CourtFlex
        </h1>
        <p className="mt-3 max-w-[38rem] text-line-dim">
          Three short steps. CourtFlex checks every new venue before players can find it, and your{" "}
          {settings.trial_days}-day free trial starts when it's approved.
        </p>
      </header>

      <ol aria-label="Steps" className="mt-8 grid grid-cols-3 gap-2">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === d.step ? "step" : undefined} className="flex flex-col gap-2">
            <span
              className={cn(
                "h-1.5 rounded-full",
                i < d.step ? "bg-field" : i === d.step ? "bg-ball" : "bg-court-raised",
              )}
            />
            <span className={cn("text-sm font-semibold", i === d.step ? "text-line" : "text-line-dim")}>
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      <section className="mt-6 rounded-[28px] border border-line-faint bg-court-surface p-5 sm:p-8">
        {d.step === 0 && <VenueStep v={d.venue} set={setVenue} errors={errors} />}

        {d.step === 1 &&
          (signedIn ? (
            <div>
              <h2 className="text-2xl font-expanded">Your account</h2>
              <p className="mt-3 flex items-start gap-3 rounded-2xl border border-field/40 bg-field/10 p-4">
                <Check className="mt-0.5 size-5 shrink-0 text-field" aria-hidden />
                <span>
                  You're signed in as <strong>{signedIn.name}</strong> ({signedIn.email}). The venue joins
                  this account, and you'll manage it from the owner portal.
                </span>
              </p>
            </div>
          ) : (
            <AccountStep
              owner={d.owner}
              setOwner={setOwner}
              password={password}
              setPassword={setPassword}
              confirm={confirm}
              setConfirm={setConfirm}
              code={code}
              setCode={setCode}
              errors={errors}
              sendCode={sendCode}
              verify={verify}
            />
          ))}

        {d.step === 2 && (
          <CourtsStep c={d.courts} count={d.venue.court_count} set={setCourts} errors={errors} />
        )}

        {signup.error && !(signup.error instanceof ApiError && signup.error.status === 422) && (
          <p role="alert" className="mt-6 border-l-2 border-signal-red pl-3 text-sm">
            {signup.error.message}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t court-line pt-6">
          {d.step > 0 ? (
            <Button size="lg" onClick={() => go((d.step - 1) as Step)}>
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </Button>
          ) : (
            <span />
          )}
          {d.step < 2 ? (
            <Button variant="primary" size="lg" onClick={next}>
              Next step
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              onClick={submit}
              loading={signup.isPending}
              disabled={!online}
            >
              Send venue for approval
            </Button>
          )}
        </div>
      </section>
      <p className="mt-4 text-center text-sm text-line-dim">
        Your progress is saved on this device. Passwords never are.
      </p>
    </div>
  );
}

function VenueStep({
  v,
  set,
  errors,
}: {
  v: VenueDraft;
  set: (k: keyof VenueDraft, value: VenueDraft[keyof VenueDraft]) => void;
  errors: Errors;
}) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const locate = () => {
    if (!("geolocation" in navigator))
      return setLocError("This browser can't share your location. Tap the map instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setLocError(null);
        set("pin", { lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        setLocating(false);
        setLocError("Couldn't get your location. Tap your venue on the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-expanded">
          <Building2 className="size-6 text-field" aria-hidden />
          Your venue
        </h2>
        <p className="mt-1 text-sm text-line-dim">What players see when they search for courts.</p>
      </div>
      <Field label="Venue name" error={errors["venue.name"]}>
        {(p) => (
          <Input
            {...p}
            placeholder="Daungan Pickleball Courts"
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
          />
        )}
      </Field>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <MapPin className="size-4 text-field" aria-hidden />
            Pin your venue on the map
          </span>
          <Button size="sm" onClick={locate} loading={locating}>
            {!locating && <LocateFixed className="size-4" aria-hidden />}
            Use my location
          </Button>
        </div>
        <div className={cn("h-72 sm:h-80", errors["venue.pin"] && "rounded-2xl ring-2 ring-signal-red")}>
          <Suspense fallback={<Skeleton className="h-full rounded-2xl" />}>
            <PinPicker
              value={v.pin}
              onChange={(pin) => set("pin", pin)}
              label="Map: tap your venue to put the pin there"
            />
          </Suspense>
        </div>
        <p className="mt-2 text-sm text-line-dim">
          {v.pin
            ? `Pinned at ${v.pin.lat.toFixed(5)}, ${v.pin.lng.toFixed(5)}. Drag the pin or tap again to move it.`
            : "Zoom in and tap your venue, or use your location while you're there."}
        </p>
        {(errors["venue.pin"] || locError) && (
          <p className="mt-1 text-sm text-signal-red">{errors["venue.pin"] ?? locError}</p>
        )}
      </div>

      <LocationPicker
        value={v.barangay_id}
        onChange={(id) => set("barangay_id", id)}
        error={errors["venue.barangay_id"]}
      />
      <Field label="Street, building or landmark" error={errors["venue.address"]}>
        {(p) => (
          <Input
            {...p}
            placeholder="Rizal St., beside the public market"
            value={v.address}
            onChange={(e) => set("address", e.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Number of courts" hint="1 to 10 on the trial." error={errors["venue.court_count"]}>
          {(p) => (
            <Select {...p} value={v.court_count} onChange={(e) => set("court_count", Number(e.target.value))}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "court" : "courts"}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Venue mobile number" error={errors["venue.contact_phone"]}>
          {(p) => (
            <Input
              {...p}
              type="tel"
              placeholder="09171234567"
              value={v.contact_phone}
              onChange={(e) => set("contact_phone", e.target.value)}
            />
          )}
        </Field>
        <Field label="Venue email (optional)" error={errors["venue.contact_email"]}>
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
    </div>
  );
}

function AccountStep({
  owner,
  setOwner,
  password,
  setPassword,
  confirm,
  setConfirm,
  code,
  setCode,
  errors,
  sendCode,
  verify,
}: {
  owner: OwnerDraft;
  setOwner: (k: keyof OwnerDraft, v: string) => void;
  password: string;
  setPassword: (s: string) => void;
  confirm: string;
  setConfirm: (s: string) => void;
  code: string;
  setCode: (s: string) => void;
  errors: Errors;
  sendCode: ReturnType<typeof useOwnerSignupCode>;
  verify: ReturnType<typeof useVerifyOwnerCode>;
}) {
  const sendErr =
    sendCode.error instanceof ApiError
      ? (sendCode.error.field("email") ?? sendCode.error.field("name") ?? sendCode.error.message)
      : undefined;
  const codeErr =
    verify.error instanceof ApiError ? (verify.error.field("code") ?? verify.error.message) : undefined;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-expanded">Your account</h2>
        <p className="mt-1 text-sm text-line-dim">
          You'll sign in with this to run the venue.{" "}
          <Link
            to="/login?next=%2Fjoin%2Fowner"
            className="font-semibold text-ball underline underline-offset-4"
          >
            Already have an account? Sign in
          </Link>
        </p>
      </div>
      <Field label="Your full name" error={errors["owner.name"]}>
        {(p) => (
          <Input
            {...p}
            autoComplete="name"
            value={owner.name}
            onChange={(e) => setOwner("name", e.target.value)}
          />
        )}
      </Field>
      <Field
        label="Email"
        hint="Your sign-in. We send a code here to confirm it."
        error={errors["owner.email"] ?? sendErr}
      >
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="email"
            value={owner.email}
            onChange={(e) => setOwner("email", e.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Password"
          hint="At least 8 characters with a letter and a number."
          error={errors["owner.password"]}
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Field label="Confirm password" error={errors["owner.password_confirmation"]}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="rounded-2xl border border-line-faint bg-court-deep/40 p-4">
        {verify.isSuccess ? (
          <p className="flex items-center gap-2 font-semibold text-field">
            <MailCheck className="size-5" aria-hidden />
            Email confirmed: {sendCode.data?.email}
          </p>
        ) : sendCode.data ? (
          <form
            noValidate
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              verify.mutate({ verification_id: sendCode.data!.verification_id, code: code.trim() });
            }}
          >
            <Field
              label={`Code sent to ${sendCode.data.email}`}
              error={codeErr ?? errors["owner.code"]}
              className="flex-1"
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="font-condensed tracking-[0.4em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              )}
            </Field>
            <Button type="submit" variant="primary" loading={verify.isPending} disabled={code.length !== 6}>
              Confirm email
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <span className="font-semibold">Confirm your email.</span>{" "}
              <span className="text-line-dim">We send a 6-digit code to it.</span>
            </p>
            <Button
              loading={sendCode.isPending}
              onClick={() => sendCode.mutate({ name: owner.name.trim(), email: owner.email.trim() })}
            >
              Send code
            </Button>
          </div>
        )}
        {!verify.isSuccess && errors["owner.code"] && !sendCode.data && (
          <p className="mt-2 text-sm text-signal-red">{errors["owner.code"]}</p>
        )}
        {sendCode.data && !verify.isSuccess && import.meta.env.VITE_USE_MOCKS !== "false" && (
          <p className="mt-2 text-xs text-line-dim">Mock API: the code is 246810.</p>
        )}
      </div>
    </div>
  );
}

function CourtsStep({
  c,
  count,
  set,
  errors,
}: {
  c: OwnerSignupCourts;
  count: number;
  set: (k: keyof OwnerSignupCourts, value: string) => void;
  errors: Errors;
}) {
  const rate = Number(c.hourly_rate);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-expanded">
          <Clock3 className="size-6 text-field" aria-hidden />
          Your courts
        </h2>
        <p className="mt-1 text-sm text-line-dim">
          One setting for {count === 1 ? "your court" : count === 2 ? "both courts" : `all ${count} courts`}{" "}
          to start. Change any court, add evening rates or closures later in the owner portal.
        </p>
      </div>
      <Segmented
        label="Courts are"
        value={c.indoor_outdoor}
        onChange={(v) => set("indoor_outdoor", v)}
        options={[
          { value: "outdoor", label: "Outdoor" },
          { value: "indoor", label: "Indoor" },
        ]}
      />
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Opens" error={errors["courts.opens_at"]}>
          {(p) => (
            <Select {...p} value={c.opens_at} onChange={(e) => set("opens_at", e.target.value)}>
              {TIMES.slice(0, -1).map((t) => (
                <option key={t} value={t}>
                  {clock(t)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Closes" error={errors["courts.closes_at"]}>
          {(p) => (
            <Select {...p} value={c.closes_at} onChange={(e) => set("closes_at", e.target.value)}>
              {TIMES.slice(1).map((t) => (
                <option key={t} value={t}>
                  {clock(t)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Rate per hour" error={errors["courts.hourly_rate"]}>
          {(p) => (
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-line-dim">
                ₱
              </span>
              <Input
                {...p}
                inputMode="decimal"
                className="pl-7 font-condensed"
                value={c.hourly_rate}
                onChange={(e) => set("hourly_rate", e.target.value)}
              />
            </div>
          )}
        </Field>
      </div>
      <p className="rounded-2xl border border-line-faint bg-court-deep/40 p-4 text-sm">
        {count} {c.indoor_outdoor} {count === 1 ? "court" : "courts"}, open {clock(c.opens_at)} to{" "}
        {clock(c.closes_at)} every day, {Number.isFinite(rate) && rate > 0 ? pesos(rate) : "₱—"} an hour.
        Players can pay at the court; add GCash or Maya in Settings.
      </p>
    </div>
  );
}

function Submitted({ result }: { result: OwnerSignupResult }) {
  const { settings } = usePlatformSettings();
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ball text-ball-ink">
        <PartyPopper className="size-7" aria-hidden />
      </span>
      <h1 className="mt-6 text-3xl leading-tight font-expanded sm:text-4xl">
        {result.club_name} is sent for approval
      </h1>
      <p className="mt-3 text-line-dim">
        CourtFlex checks every new venue, usually within a day. Players can find and book it once it's
        approved, and your {settings.trial_days}-day free trial starts then. Meanwhile, set up your courts,
        payments and staff.
      </p>
      <a
        href={`/owner/v/${result.club_slug}`}
        className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-ball px-6 font-semibold text-ball-ink hover:bg-ball-bright"
      >
        Open your owner portal
        <ArrowRight className="size-4" aria-hidden />
      </a>
    </div>
  );
}
