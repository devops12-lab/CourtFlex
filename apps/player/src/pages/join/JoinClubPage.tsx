import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, X } from "lucide-react";
import type {
  ClubProfile,
  DominantHand,
  Gender,
  JoinClubInput,
  JoinPlayTime,
  MembershipPayMethod,
  MembershipPlan,
  PlayFocus,
  SkillLevel,
} from "@courtflex/api";
import { ApiError, useClubProfile, useJoinClub, useMe, useProfile } from "@courtflex/api";
import {
  Button,
  cn,
  ErrorState,
  Field,
  Input,
  Segmented,
  Select,
  Skeleton,
  useOnline,
  useToast,
} from "@courtflex/ui";
import {
  ClubLogo,
  focusLabels,
  genderLabels,
  handLabels,
  joinTimeLabels,
  payMethodLabels,
  pesos,
  skillRatings,
} from "@courtflex/features";
import { NotFound } from "../NotFound";
import { SignaturePad } from "./SignaturePad";

const steps = ["Your details", "Pickleball profile", "Membership plan", "Agreement and signature"];

interface Draft {
  full_name: string;
  email: string;
  phone: string;
  birth_date: string;
  gender: Gender | "";
  emergency_contact_name: string;
  emergency_contact_phone: string;
  skill_level: SkillLevel | "";
  dominant_hand: DominantHand | "";
  play_focus: PlayFocus | "";
  preferred_times: JoinPlayTime[];
  plan_id: string | null;
  payment_method: MembershipPayMethod | "";
  accept_waiver: boolean;
  sign_by: "draw" | "type";
  signature_image: string | null;
  signature_name: string;
}

type Errors = Partial<Record<string, string>>;

/** Which step each field is on, so a server error can send the player back to it. */
const fieldStep: Record<string, number> = {
  full_name: 0,
  email: 0,
  phone: 0,
  birth_date: 0,
  gender: 0,
  emergency_contact_name: 0,
  emergency_contact_phone: 0,
  skill_level: 1,
  dominant_hand: 1,
  play_focus: 1,
  preferred_times: 1,
  plan_id: 2,
  payment_method: 2,
  accept_waiver: 3,
  signature: 3,
};

const PHONE_RE = /^(\+?63|0)9\d{9}$/;
const phoneOk = (v: string) => PHONE_RE.test(v.replace(/[\s-]/g, ""));

/** The same checks the server makes, per step, so mistakes show before moving on. */
function check(step: number, d: Draft, club: ClubProfile): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (d.full_name.trim().length < 3) e.full_name = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = "Enter a valid email.";
    if (!phoneOk(d.phone)) e.phone = "Enter a mobile number, like 09171234567.";
    if (!d.birth_date) e.birth_date = "Enter your date of birth.";
    if (!d.gender) e.gender = "Choose an option.";
    if (!d.emergency_contact_name.trim())
      e.emergency_contact_name = "Enter who we should call in an emergency.";
    if (!phoneOk(d.emergency_contact_phone))
      e.emergency_contact_phone = "Enter their mobile number, like 09171234567.";
    else if (d.emergency_contact_phone.replace(/[\s-]/g, "") === d.phone.replace(/[\s-]/g, ""))
      e.emergency_contact_phone = "Use someone else's number, not your own.";
  }
  if (step === 1) {
    if (!d.skill_level) e.skill_level = "Choose your level.";
    if (!d.dominant_hand) e.dominant_hand = "Choose your playing hand.";
    if (!d.play_focus) e.play_focus = "Choose what you play for.";
    if (!d.preferred_times.length) e.preferred_times = "Choose at least one time you usually play.";
  }
  if (step === 2) {
    const plan = club.plans.find((p) => p.id === d.plan_id);
    if (club.plans.length && !plan) e.plan_id = "Choose a membership plan.";
    if (plan && Number(plan.price) > 0 && !d.payment_method) e.payment_method = "Choose how you'll pay.";
  }
  if (step === 3) {
    if (!d.accept_waiver) e.accept_waiver = "Agree to the membership agreement to join.";
    if (d.sign_by === "draw" && !d.signature_image)
      e.signature = "Draw your signature, or type your name instead.";
    if (d.sign_by === "type") {
      if (!d.signature_name.trim()) e.signature = "Type your full name to sign.";
      else if (d.signature_name.trim().toLowerCase() !== d.full_name.trim().toLowerCase())
        e.signature = `Type your name exactly as on step 1: ${d.full_name.trim()}.`;
    }
  }
  return e;
}

/** Ways this club takes membership payments. */
const methodsOf = (club: ClubProfile): MembershipPayMethod[] => [
  ...(club.payment_options.gcash ? (["gcash"] as const) : []),
  ...(club.payment_options.maya ? (["maya"] as const) : []),
  ...(club.payment_options.in_person ? (["in_person"] as const) : []),
];

const perLabel = (days: number | null) =>
  days === null ? "" : days === 30 ? "/month" : days === 365 ? "/year" : `/${Math.round(days / 30)} months`;

/** Joining a club: details, pickleball profile, plan and payment choice, then the agreement and signature. */
export function JoinClubPage() {
  const { slug } = useParams();
  const profile = useClubProfile("community", slug);
  if (profile.isPending) return <Skeleton className="mx-auto h-[36rem] max-w-3xl" />;
  if (profile.error) {
    return profile.error instanceof ApiError && profile.error.status === 404 ? (
      <NotFound message="This club doesn't exist, or it isn't public yet." />
    ) : (
      <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} />
    );
  }
  const club = profile.data;
  const m = club.me.membership;
  // Already in, or already asked: the membership page shows where things stand.
  if ((m && m.status !== "rejected" && m.status !== "expired") || club.me.role === "staff")
    return <Navigate to={`/clubs/community/${club.slug}/membership`} replace />;
  if (club.status !== "active") return <NotFound message="This club isn't taking members yet." />;
  return <JoinWizard club={club} />;
}

function JoinWizard({ club }: { club: ClubProfile }) {
  const me = useMe();
  const player = useProfile();
  const join = useJoinClub("community", club.id);
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const recommended = club.plans.find((p) => p.recommended) ?? club.plans[0];
  const [d, setD] = useState<Draft>(() => ({
    full_name: me.data?.name ?? "",
    email: me.data?.email ?? "",
    phone: "",
    birth_date: "",
    gender: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    skill_level: player.data && player.data.skill_level !== "all" ? player.data.skill_level : "",
    dominant_hand: "",
    play_focus: "",
    preferred_times: (player.data?.preferred_times ?? []).map((t) => (t === "afternoon" ? "midday" : t)),
    plan_id: recommended?.id ?? null,
    payment_method: "",
    accept_waiver: false,
    sign_by: "draw",
    signature_image: null,
    signature_name: "",
  }));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({
      ...e,
      [k === "signature_image" || k === "signature_name" ? "signature" : k]: undefined,
    }));
  };

  const plan = club.plans.find((p) => p.id === d.plan_id);
  const paid = !!plan && Number(plan.price) > 0;
  const methods = methodsOf(club);

  const next = () => {
    const e = check(step, d, club);
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError();
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => {
    setErrors({});
    setStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    const e = check(3, d, club);
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError();
    const body: JoinClubInput = {
      plan_id: d.plan_id,
      payment_method: paid ? (d.payment_method as MembershipPayMethod) : undefined,
      application: {
        full_name: d.full_name.trim(),
        email: d.email.trim(),
        phone: d.phone.trim(),
        birth_date: d.birth_date,
        gender: d.gender as Gender,
        emergency_contact_name: d.emergency_contact_name.trim(),
        emergency_contact_phone: d.emergency_contact_phone.trim(),
        skill_level: d.skill_level as SkillLevel,
        dominant_hand: d.dominant_hand as DominantHand,
        play_focus: d.play_focus as PlayFocus,
        preferred_times: d.preferred_times,
        signature:
          d.sign_by === "draw"
            ? { kind: "drawn", image: d.signature_image! }
            : { kind: "typed", name: d.signature_name.trim() },
        accept_waiver: d.accept_waiver,
      },
    };
    join.mutate(body, {
      onSuccess: (m) => {
        toast({
          tone: "success",
          message:
            m.status === "active"
              ? `Welcome to ${club.name}.`
              : m.payment
                ? "Application sent. Next, pay for your plan."
                : `Application sent. ${club.name} will review it.`,
        });
        navigate(`/clubs/community/${club.slug}/membership`, { replace: true });
      },
      onError: (err) => {
        if (!(err instanceof ApiError) || err.status !== 422) return;
        // Server checks win: show each message and go back to the first step with a problem.
        const found: Errors = {};
        for (const f of Object.keys(fieldStep)) {
          const msg = err.field(f);
          if (msg) found[f] = msg;
        }
        setErrors(found);
        const first = Math.min(...Object.keys(found).map((f) => fieldStep[f] ?? 3));
        if (Number.isFinite(first)) setStep(first);
      },
    });
  };

  const submitLabel = paid
    ? "Send application and pay"
    : club.join_policy === "approval"
      ? "Send application"
      : "Join club";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to={`/clubs/community/${club.slug}`}
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {club.name}
      </Link>

      <header className="mt-4 flex items-center gap-4">
        <ClubLogo name={club.name} url={club.logo_url} size="lg" />
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-expanded font-extrabold sm:text-3xl">
            Join {club.name}
          </h1>
          <p className="mt-1 text-sm text-line-dim">{club.tagline}</p>
        </div>
      </header>

      <div className="mt-6 overflow-hidden rounded-lg border border-line-faint bg-court-surface">
        <Stepper step={step} />
        <div className="border-t court-line p-5 sm:p-8">
          {step === 0 && <DetailsStep d={d} set={set} errors={errors} club={club} />}
          {step === 1 && <ProfileStep d={d} set={set} errors={errors} />}
          {step === 2 && (
            <PlanStep d={d} set={set} errors={errors} club={club} plan={plan} methods={methods} />
          )}
          {step === 3 && <AgreementStep d={d} set={set} errors={errors} club={club} />}

          {join.error && !(join.error instanceof ApiError && join.error.status === 422) && (
            <p role="alert" className="mt-6 border-l-2 border-signal-red pl-3 text-sm">
              {join.error.message}
            </p>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t court-line pt-6">
            {step > 0 ? (
              <Button size="lg" onClick={back}>
                <ArrowLeft className="size-4" aria-hidden />
                Back
              </Button>
            ) : (
              <span />
            )}
            {step < steps.length - 1 ? (
              <Button variant="primary" size="lg" onClick={next}>
                Next step
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={submit}
                loading={join.isPending}
                disabled={!online}
              >
                {submitLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Moves focus to the first field with an error, after it renders. */
function focusFirstError() {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]');
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="px-3 py-6 sm:px-8">
      <ol className="relative grid grid-cols-4" aria-label="Steps">
        {/* The track behind the numbers, filled up to the current step. */}
        <span
          aria-hidden
          className="absolute top-[1.0625rem] right-[12.5%] left-[12.5%] h-0.5 bg-line-faint"
        />
        <span
          aria-hidden
          className="absolute top-[1.0625rem] left-[12.5%] h-0.5 bg-ball transition-[width] duration-300"
          style={{ width: `${(step / (steps.length - 1)) * 75}%` }}
        />
        {steps.map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className="relative flex flex-col items-center gap-2 text-center"
            >
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full border-2 text-sm font-bold",
                  done && "border-field bg-field text-court-deep",
                  current && "border-ball bg-ball text-ball-ink",
                  !done && !current && "border-line-faint bg-court-raised text-line-dim",
                )}
              >
                {done ? <Check className="size-4" aria-label="Done" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold sm:text-sm",
                  current ? "text-ball" : done ? "text-field" : "text-line-dim",
                  !current && "max-sm:sr-only",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface StepProps {
  d: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  errors: Errors;
}

function StepHeading({ title, intro }: { title: string; intro: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-expanded font-extrabold">{title}</h2>
      <p className="mt-1 text-line-dim">{intro}</p>
    </div>
  );
}

function DetailsStep({ d, set, errors, club }: StepProps & { club: ClubProfile }) {
  return (
    <>
      <StepHeading
        title="Your details"
        intro={`How ${club.name} can reach you. Only the club's admins see these.`}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" error={errors.full_name} className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              autoComplete="name"
              value={d.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          )}
        </Field>
        <Field label="Email" error={errors.email}>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="email"
              value={d.email}
              onChange={(e) => set("email", e.target.value)}
            />
          )}
        </Field>
        <Field label="Mobile number" error={errors.phone}>
          {(p) => (
            <Input
              {...p}
              type="tel"
              autoComplete="tel"
              placeholder="09171234567"
              value={d.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          )}
        </Field>
        <Field label="Date of birth" error={errors.birth_date}>
          {(p) => (
            <Input
              {...p}
              type="date"
              autoComplete="bday"
              max={new Date().toISOString().slice(0, 10)}
              value={d.birth_date}
              onChange={(e) => set("birth_date", e.target.value)}
            />
          )}
        </Field>
        <Field label="Gender" error={errors.gender}>
          {(p) => (
            <Select {...p} value={d.gender} onChange={(e) => set("gender", e.target.value as Gender)}>
              <option value="">Choose an option</option>
              {Object.entries(genderLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <fieldset className="mt-8 border-t court-line pt-6">
        <legend className="sr-only">Emergency contact</legend>
        <h3 className="font-semibold">Emergency contact</h3>
        <p className="mt-1 text-sm text-line-dim">Who the club calls if you get hurt at a session.</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field label="Their name" error={errors.emergency_contact_name}>
            {(p) => (
              <Input
                {...p}
                value={d.emergency_contact_name}
                onChange={(e) => set("emergency_contact_name", e.target.value)}
              />
            )}
          </Field>
          <Field label="Their mobile number" error={errors.emergency_contact_phone}>
            {(p) => (
              <Input
                {...p}
                type="tel"
                placeholder="09171234567"
                value={d.emergency_contact_phone}
                onChange={(e) => set("emergency_contact_phone", e.target.value)}
              />
            )}
          </Field>
        </div>
      </fieldset>
    </>
  );
}

function ProfileStep({ d, set, errors }: StepProps) {
  const levels = Object.entries(skillRatings) as Array<
    [Exclude<SkillLevel, "all">, { rating: string; about: string }]
  >;
  return (
    <>
      <StepHeading
        title="Pickleball profile"
        intro="Helps hosts pair you with players at your level. You can change it later."
      />
      <fieldset>
        <legend className="mb-3 text-sm font-medium">Your level</legend>
        <div
          role="radiogroup"
          aria-label="Your level"
          className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5"
          data-invalid={errors.skill_level ? true : undefined}
          tabIndex={errors.skill_level ? -1 : undefined}
        >
          {levels.map(([key, info]) => {
            const on = d.skill_level === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("skill_level", key)}
                className={cn(
                  "flex flex-col rounded-md border p-4 text-left transition-colors",
                  on ? "border-ball bg-ball/10" : "border-line-faint hover:border-line-dim",
                )}
              >
                <span className="font-bold">{skillName[key]}</span>
                <span className="mt-0.5 text-sm font-semibold font-condensed text-ball">
                  Rating {info.rating}
                </span>
                <span className="mt-2 text-sm text-line-dim">{info.about}</span>
              </button>
            );
          })}
        </div>
        {errors.skill_level && <p className="mt-2 text-sm text-signal-red">{errors.skill_level}</p>}
      </fieldset>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="Playing hand" error={errors.dominant_hand}>
          {(p) => (
            <Select
              {...p}
              value={d.dominant_hand}
              onChange={(e) => set("dominant_hand", e.target.value as DominantHand)}
            >
              <option value="">Choose one</option>
              {Object.entries(handLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="You mostly play for" error={errors.play_focus}>
          {(p) => (
            <Select
              {...p}
              value={d.play_focus}
              onChange={(e) => set("play_focus", e.target.value as PlayFocus)}
            >
              <option value="">Choose one</option>
              {Object.entries(focusLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <fieldset className="mt-6">
        <legend className="mb-3 text-sm font-medium">When you usually play</legend>
        <div
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
          data-invalid={errors.preferred_times ? true : undefined}
        >
          {(Object.keys(joinTimeLabels) as JoinPlayTime[]).map((t) => {
            const on = d.preferred_times.includes(t);
            return (
              <label
                key={t}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-sm",
                  on ? "border-ball" : "border-line-faint hover:border-line-dim",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    set(
                      "preferred_times",
                      e.target.checked ? [...d.preferred_times, t] : d.preferred_times.filter((x) => x !== t),
                    )
                  }
                  className="size-4 accent-[var(--color-ball)]"
                />
                {joinTimeLabels[t]}
              </label>
            );
          })}
        </div>
        {errors.preferred_times && <p className="mt-2 text-sm text-signal-red">{errors.preferred_times}</p>}
      </fieldset>
    </>
  );
}

const skillName: Record<Exclude<SkillLevel, "all">, string> = {
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
  pro: "Competitive",
};

function PlanStep({
  d,
  set,
  errors,
  club,
  plan,
  methods,
}: StepProps & {
  club: ClubProfile;
  plan: MembershipPlan | undefined;
  methods: MembershipPayMethod[];
}) {
  const paid = !!plan && Number(plan.price) > 0;
  return (
    <>
      <StepHeading title="Membership plan" intro="Choose the plan that fits how often you play." />
      {club.plans.length === 0 ? (
        <p className="text-line-dim">This club has one free membership. Nothing to choose.</p>
      ) : (
        <div
          role="radiogroup"
          aria-label="Membership plan"
          className={cn("grid gap-4 pt-3", club.plans.length > 1 && "sm:grid-cols-2 lg:grid-cols-3")}
        >
          {club.plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              selected={p.id === d.plan_id}
              onSelect={() => set("plan_id", p.id)}
            />
          ))}
        </div>
      )}
      {errors.plan_id && <p className="mt-2 text-sm text-signal-red">{errors.plan_id}</p>}

      {paid && (
        <fieldset className="mt-8 border-t court-line pt-6">
          <legend className="sr-only">How you'll pay</legend>
          <h3 className="font-semibold">How you'll pay {pesos(plan!.price)}</h3>
          {methods.length === 0 ? (
            <p className="mt-2 text-sm text-signal-amber">
              This club hasn't set up payments yet. Choose the free plan, or ask an admin.
            </p>
          ) : (
            <>
              <div
                className="mt-3 grid gap-3 sm:grid-cols-3"
                data-invalid={errors.payment_method ? true : undefined}
              >
                {methods.map((m) => {
                  const on = d.payment_method === m;
                  return (
                    <label
                      key={m}
                      className={cn(
                        "flex cursor-pointer flex-col gap-1 rounded-md border p-4",
                        on ? "border-ball bg-ball/10" : "border-line-faint hover:border-line-dim",
                      )}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <input
                          type="radio"
                          name="pay"
                          checked={on}
                          onChange={() => set("payment_method", m)}
                          className="size-4 accent-[var(--color-ball)]"
                        />
                        {payMethodLabels[m]}
                      </span>
                      <span className="text-sm text-line-dim">
                        {m === "in_person"
                          ? "Pay an admin at a session. They record it."
                          : "Send the money, then upload the receipt screenshot."}
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.payment_method && (
                <p className="mt-2 text-sm text-signal-red">{errors.payment_method}</p>
              )}
              <p className="mt-3 text-sm text-line-dim">
                Your membership starts once a club admin confirms the payment.
              </p>
            </>
          )}
        </fieldset>
      )}
    </>
  );
}

function PlanCard({
  plan: p,
  selected,
  onSelect,
}: {
  plan: MembershipPlan;
  selected: boolean;
  onSelect: () => void;
}) {
  const free = Number(p.price) === 0;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative flex flex-col rounded-lg border p-5 text-left transition-colors",
        selected ? "border-ball bg-ball/[0.06]" : "border-line-faint hover:border-line-dim",
      )}
    >
      {p.recommended && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ball px-3 py-0.5 text-xs font-bold whitespace-nowrap text-ball-ink">
          Recommended
        </span>
      )}
      <span className="text-lg font-expanded font-extrabold">{p.name}</span>
      {p.description && <span className="mt-1 text-sm text-line-dim">{p.description}</span>}
      <span className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold font-condensed">{pesos(p.price)}</span>
        {!free && <span className="text-sm text-line-dim">{perLabel(p.duration_days)}</span>}
      </span>
      {p.session_discount_percent > 0 && (
        <span className="mt-1 text-sm font-semibold text-ball">
          {p.session_discount_percent}% off every session fee
        </span>
      )}
      {p.perks.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {p.perks.map((perk) => (
            <li key={perk.text} className={cn("flex gap-2", !perk.included && "text-line-dim")}>
              {perk.included ? (
                <Check className="mt-0.5 size-4 shrink-0 text-ball" aria-label="Included" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0" aria-label="Not included" />
              )}
              <span className={cn(!perk.included && "line-through")}>{perk.text}</span>
            </li>
          ))}
        </ul>
      )}
      <span
        aria-hidden
        className={cn(
          "mt-5 flex h-10 items-center justify-center rounded-full text-sm font-bold",
          selected ? "bg-ball text-ball-ink" : "border border-line-faint",
        )}
      >
        {selected ? "Selected" : "Choose plan"}
      </span>
    </button>
  );
}

function AgreementStep({ d, set, errors, club }: StepProps & { club: ClubProfile }) {
  return (
    <>
      <StepHeading
        title="Agreement and signature"
        intro={`Read ${club.name}'s membership agreement, then sign to join.`}
      />
      <div
        role="region"
        aria-label={`${club.name} membership agreement`}
        // A scrolling box must be focusable so keyboard users can scroll it.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="max-h-64 overflow-y-auto rounded-md border border-line-faint bg-court-deep p-4 text-sm leading-relaxed whitespace-pre-line"
      >
        {club.waiver}
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={d.accept_waiver}
          onChange={(e) => set("accept_waiver", e.target.checked)}
          aria-invalid={errors.accept_waiver ? true : undefined}
          className="mt-1 size-4 accent-[var(--color-ball)]"
        />
        <span>I agree to the {club.name} membership agreement.</span>
      </label>
      {errors.accept_waiver && <p className="mt-1 text-sm text-signal-red">{errors.accept_waiver}</p>}

      <div className="mt-8 border-t court-line pt-6">
        <Segmented
          label="Signature"
          value={d.sign_by}
          onChange={(v) => set("sign_by", v)}
          options={[
            { value: "draw", label: "Draw it" },
            { value: "type", label: "Type your name" },
          ]}
        />
        <div className="mt-4">
          {d.sign_by === "draw" ? (
            <SignaturePad
              value={d.signature_image}
              onChange={(png) => set("signature_image", png)}
              invalid={!!errors.signature}
            />
          ) : (
            <Field
              label="Type your full name to sign"
              hint={`Exactly as on step 1: ${d.full_name.trim() || "your full name"}.`}
              error={errors.signature}
            >
              {(p) => (
                <Input
                  {...p}
                  autoComplete="name"
                  className="text-xl italic"
                  value={d.signature_name}
                  onChange={(e) => set("signature_name", e.target.value)}
                />
              )}
            </Field>
          )}
          {d.sign_by === "draw" && errors.signature && (
            <p className="mt-2 text-sm text-signal-red" data-invalid="true" tabIndex={-1}>
              {errors.signature}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
