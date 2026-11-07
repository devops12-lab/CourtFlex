import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError, useForgotPassword, useResetPassword } from "@courtflex/api";
import { Button, Field, Input, useOnline } from "@courtflex/ui";
import { AuthShell, MockHint } from "./AuthShell";

export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const online = useOnline();
  const [email, setEmail] = useState("");
  const sent = forgot.isSuccess;
  const mockLink = (forgot.data as { mock_reset_url?: string } | undefined)?.mock_reset_url;

  return (
    <AuthShell
      title={sent ? "Check your email" : "Reset your password"}
      intro={
        sent
          ? `If ${email} has a CourtFlex account, a reset link is on its way. It works for 30 minutes.`
          : "Enter your email and we'll send a link to choose a new password."
      }
    >
      {!sent ? (
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            forgot.mutate({ email });
          }}
        >
          <Field
            label="Email"
            error={
              forgot.error instanceof ApiError
                ? (forgot.error.field("email") ?? forgot.error.message)
                : undefined
            }
          >
            {(p) => (
              <Input
                {...p}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={forgot.isPending} disabled={!online}>
            Send reset link
          </Button>
        </form>
      ) : (
        <Link to="/login" className="font-semibold text-ball underline underline-offset-4">
          Back to sign in
        </Link>
      )}
      {mockLink && (
        <MockHint>
          no email is sent.{" "}
          <Link to={mockLink} className="font-semibold text-line underline underline-offset-4">
            Open the reset link
          </Link>
        </MockHint>
      )}
      {!sent && (
        <p className="mt-6 text-sm text-line-dim">
          Remembered it?{" "}
          <Link to="/login" className="font-semibold text-line underline underline-offset-4">
            Sign in
          </Link>
        </p>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const reset = useResetPassword();
  const online = useOnline();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const err = (f: string) => (reset.error instanceof ApiError ? reset.error.field(f) : undefined);

  if (reset.isSuccess) {
    return (
      <AuthShell title="Password changed" intro="Sign in with your new password.">
        <Link
          to="/login"
          className="inline-flex h-12 items-center rounded-full bg-ball px-5 font-semibold text-ball-ink"
        >
          Sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          reset.mutate({ token, password, password_confirmation: confirm });
        }}
      >
        <Field
          label="New password"
          hint="At least 8 characters with a letter and a number."
          error={err("password")}
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
        <Field label="New password again" error={err("password_confirmation")}>
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
        {reset.error && !(reset.error instanceof ApiError && reset.error.status === 422) && (
          <p role="alert" className="text-sm text-signal-red">
            {reset.error.message}{" "}
            <Link to="/forgot-password" className="font-semibold underline underline-offset-4">
              Get a new link
            </Link>
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={reset.isPending}
          disabled={!online || !token}
        >
          Save password
        </Button>
      </form>
    </AuthShell>
  );
}
