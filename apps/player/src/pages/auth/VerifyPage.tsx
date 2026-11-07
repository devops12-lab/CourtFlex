import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { ApiError, useMe, useResendVerification, useVerifyEmail } from "@courtflex/api";
import { Button, Field, Input, Skeleton, useOnline, useToast } from "@courtflex/ui";
import { joinAside, AuthShell, MockHint } from "./AuthShell";

export function VerifyPage() {
  const me = useMe();
  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const [code, setCode] = useState("");

  if (me.isPending) return <Skeleton className="m-6 h-40" />;
  if (!me.data) return <Navigate to="/login" replace />;
  if (me.data.email_verified)
    return <Navigate to={me.data.needs_onboarding ? "/onboarding" : "/home"} replace />;

  return (
    <AuthShell
      aside={joinAside}
      title="Check your email"
      intro={
        <>
          We sent a 6-digit code to <strong className="text-line">{me.data.email}</strong>.
        </>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate({ code }, { onSuccess: () => navigate("/onboarding") });
        }}
      >
        <Field
          label="Code"
          error={
            verify.error instanceof ApiError
              ? (verify.error.field("code") ?? verify.error.message)
              : undefined
          }
        >
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="text-2xl font-condensed tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={verify.isPending}
          disabled={!online || code.length !== 6}
        >
          Verify email
        </Button>
        <Button
          variant="ghost"
          loading={resend.isPending}
          onClick={() =>
            resend.mutate(undefined, {
              onSuccess: () =>
                toast({ tone: "success", message: "New code sent. It may take a minute to arrive." }),
              onError: (e) => toast({ tone: "error", message: e.message }),
            })
          }
        >
          Send a new code
        </Button>
      </form>
      <MockHint>no email is sent. The code is 246810.</MockHint>
    </AuthShell>
  );
}
