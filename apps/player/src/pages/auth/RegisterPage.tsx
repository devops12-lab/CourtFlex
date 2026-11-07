import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { ApiError, useMe, useRegister } from "@courtflex/api";
import { LockKeyhole, Mail, Phone, UserRound } from "lucide-react";
import { Button, useOnline } from "@courtflex/ui";
import {
  AuthField,
  AuthFooter,
  AuthInput,
  AuthShell,
  authSubmit,
  joinAside,
  PasswordInput,
} from "./AuthShell";

/** One global account for every club (blueprint §4.1). */
export function RegisterPage() {
  const me = useMe();
  const register = useRegister();
  const navigate = useNavigate();
  const online = useOnline();
  const [v, setV] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    password_confirmation: "",
    accept_terms: false,
  });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((x) => ({ ...x, [k]: value }));
  const err = (f: string) => (register.error instanceof ApiError ? register.error.field(f) : undefined);

  if (me.data) return <Navigate to="/home" replace />;

  return (
    <AuthShell
      title="Create your account"
      intro="One account for booking courts, open play and clubs."
      aside={joinAside}
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          register.mutate(v, { onSuccess: () => navigate("/verify") });
        }}
      >
        <AuthField label="Full name" icon={UserRound} hint="Other players see this." error={err("name")}>
          {(p) => (
            <AuthInput
              {...p}
              autoComplete="name"
              placeholder="Juan Dela Cruz"
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
            />
          )}
        </AuthField>
        <AuthField label="Email address" icon={Mail} error={err("email")}>
          {(p) => (
            <AuthInput
              {...p}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={v.email}
              onChange={(e) => set("email", e.target.value)}
            />
          )}
        </AuthField>
        <AuthField
          label="Mobile number (optional)"
          icon={Phone}
          hint="For booking reminders."
          error={err("phone")}
        >
          {(p) => (
            <AuthInput
              {...p}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0917 123 4567"
              value={v.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          )}
        </AuthField>
        <AuthField
          label="Password"
          icon={LockKeyhole}
          hint="At least 8 characters with a letter and a number."
          error={err("password")}
        >
          {(p) => (
            <PasswordInput
              {...p}
              autoComplete="new-password"
              placeholder="Create a password"
              value={v.password}
              onChange={(e) => set("password", e.target.value)}
            />
          )}
        </AuthField>
        <AuthField label="Confirm password" icon={LockKeyhole} error={err("password_confirmation")}>
          {(p) => (
            <PasswordInput
              {...p}
              autoComplete="new-password"
              placeholder="Type it again"
              value={v.password_confirmation}
              onChange={(e) => set("password_confirmation", e.target.value)}
            />
          )}
        </AuthField>
        <div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
            <input
              type="checkbox"
              checked={v.accept_terms}
              onChange={(e) => set("accept_terms", e.target.checked)}
              className="mt-1 size-4 accent-[var(--color-ball)]"
            />
            <span className="text-sm text-line-dim">I agree to the CourtFlex terms and privacy policy.</span>
          </label>
          {err("accept_terms") && <p className="mt-1 text-sm text-signal-red">{err("accept_terms")}</p>}
        </div>
        {register.error && !(register.error instanceof ApiError && register.error.status === 422) && (
          <p role="alert" className="text-sm text-signal-red">
            {register.error.message}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className={authSubmit}
          loading={register.isPending}
          disabled={!online}
        >
          Create account
        </Button>
      </form>
      <AuthFooter prompt="Already have an account?" to="/login" action="Sign in" />
    </AuthShell>
  );
}
