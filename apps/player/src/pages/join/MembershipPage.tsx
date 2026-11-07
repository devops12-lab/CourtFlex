import { useState } from "react";
import { Link, useParams } from "react-router";
import { Check, ChevronLeft, Copy, Hourglass } from "lucide-react";
import type { ClubProfile, MemberPayment, MemberSummary, WalletAccount } from "@courtflex/api";
import { ApiError, formatDateShort, useClubProfile, useSendMembershipReceipt } from "@courtflex/api";
import { Button, cn, ErrorState, Field, Input, Skeleton, useOnline, useToast } from "@courtflex/ui";
import { ClubLogo, ImagePicker, memberStatusLabels, payMethodLabels, pesos } from "@courtflex/features";
import { NotFound } from "../NotFound";

const TZ = "Asia/Manila";

/** Where a player's membership stands: paying, waiting for the club, or in. */
export function MembershipPage() {
  const { slug } = useParams();
  const profile = useClubProfile("community", slug);
  if (profile.isPending) return <Skeleton className="mx-auto h-96 max-w-2xl" />;
  if (profile.error) {
    return profile.error instanceof ApiError && profile.error.status === 404 ? (
      <NotFound message="This club doesn't exist, or it isn't public yet." />
    ) : (
      <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} />
    );
  }
  const club = profile.data;
  const m = club.me.membership;

  return (
    <div className="mx-auto max-w-2xl">
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
          <p className="text-sm text-line-dim">Your membership</p>
          <h1 className="text-2xl leading-tight font-expanded font-extrabold sm:text-3xl">{club.name}</h1>
        </div>
      </header>
      <div className="mt-6">{m ? <Standing club={club} m={m} /> : <NotJoined club={club} />}</div>
    </div>
  );
}

function NotJoined({ club }: { club: ClubProfile }) {
  return (
    <div className="rounded-lg border border-line-faint bg-court-surface p-6">
      <p>You're not a member of {club.name} yet.</p>
      <Link
        to={`/clubs/community/${club.slug}/join`}
        className="mt-4 inline-flex h-11 items-center rounded-full bg-ball px-5 font-semibold text-ball-ink hover:bg-ball-bright"
      >
        Join {club.name}
      </Link>
    </div>
  );
}

function Standing({ club, m }: { club: ClubProfile; m: MemberSummary }) {
  const p = m.payment;
  if (m.status === "active")
    return (
      <StatusCard tone="good" title={`You're a member of ${club.name}.`}>
        {m.plan?.name ?? "Member"}
        {m.expires_at ? `, until ${formatDateShort(m.expires_at, TZ)}.` : ", with no expiry."}{" "}
        <Link to="/sessions" className="font-semibold text-ball underline underline-offset-4">
          Find a session
        </Link>
      </StatusCard>
    );
  if (m.status !== "pending")
    return (
      <StatusCard tone="bad" title={memberStatusLabels[m.status]}>
        {m.status === "rejected"
          ? `${club.name} turned down your request. You can apply again.`
          : m.status === "expired"
            ? "Your membership ended. Renew it with a club admin."
            : `Your membership is suspended. Contact ${club.name}.`}
      </StatusCard>
    );
  if (!p)
    return (
      <StatusCard tone="wait" title="Application sent">
        {club.name}'s admins review new members. You'll see here when you're in.
      </StatusCard>
    );
  if (p.status === "pay_in_person")
    return (
      <StatusCard tone="wait" title={`Pay ${pesos(p.amount)} in person`}>
        Hand it to a club admin at any session. Your membership starts when they record it.
        {club.payment_options.instructions && (
          <span className="mt-2 block text-line-dim">{club.payment_options.instructions}</span>
        )}
      </StatusCard>
    );
  if (p.status === "in_review")
    return (
      <StatusCard tone="wait" title="Receipt sent">
        {club.name}'s admins check it against their {payMethodLabels[p.method]} account. Your membership
        starts once they confirm it.
        {p.receipt_url && (
          <img
            src={p.receipt_url}
            alt="Your receipt"
            className="mt-4 max-h-56 w-auto rounded-sm border border-line-faint bg-white object-contain"
          />
        )}
      </StatusCard>
    );
  return <PayAndUpload club={club} payment={p} />;
}

function PayAndUpload({ club, payment: p }: { club: ClubProfile; payment: MemberPayment }) {
  const send = useSendMembershipReceipt(club.id);
  const toast = useToast();
  const online = useOnline();
  const [receipt, setReceipt] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [missing, setMissing] = useState(false);
  const account = p.method === "gcash" ? club.payment_options.gcash : club.payment_options.maya;
  const label = payMethodLabels[p.method];
  const err = (f: string) => (send.error instanceof ApiError ? send.error.field(f) : undefined);

  return (
    <div className="flex flex-col gap-6">
      {p.status === "rejected" && (
        <div role="alert" className="rounded-md border border-signal-red/60 bg-signal-red/10 p-4 text-sm">
          <strong className="font-semibold">The club turned down your last receipt.</strong>{" "}
          {p.rejection_reason} Send another one below.
        </div>
      )}

      <section
        aria-labelledby="pay-h"
        className="rounded-lg border border-line-faint bg-court-surface p-5 sm:p-6"
      >
        <h2 id="pay-h" className="text-xl font-expanded font-bold">
          1. Send {pesos(p.amount)} by {label}
        </h2>
        {account ? (
          <AccountCard account={account} label={label} />
        ) : (
          <p className="mt-3 text-sm text-signal-amber">
            The club removed its {label} account. Ask an admin how to pay.
          </p>
        )}
        {club.payment_options.instructions && (
          <p className="mt-3 text-sm text-line-dim">{club.payment_options.instructions}</p>
        )}
      </section>

      <form
        noValidate
        aria-labelledby="up-h"
        className="rounded-lg border border-line-faint bg-court-surface p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!receipt) return setMissing(true);
          send.mutate(
            { receipt, reference_number: reference.trim() || undefined },
            { onSuccess: () => toast({ tone: "success", message: "Receipt sent. The club will check it." }) },
          );
        }}
      >
        <h2 id="up-h" className="text-xl font-expanded font-bold">
          2. Upload the receipt
        </h2>
        <p className="mt-1 text-sm text-line-dim">
          A screenshot of the {label} confirmation, showing the amount and reference number.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
          <ImagePicker
            label="Receipt screenshot"
            value={receipt}
            onChange={(x) => {
              setReceipt(x);
              setMissing(false);
            }}
            error={missing ? "Add the screenshot of your receipt." : err("receipt")}
          />
          <Field
            label="Reference number (optional)"
            hint="Helps the club find your payment quickly."
            error={err("reference_number")}
          >
            {(f) => (
              <Input
                {...f}
                inputMode="numeric"
                className="font-condensed"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            )}
          </Field>
        </div>
        {send.error && !(send.error instanceof ApiError && send.error.status === 422) && (
          <p role="alert" className="mt-4 text-sm text-signal-red">
            {send.error.message}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-6"
          loading={send.isPending}
          disabled={!online}
        >
          Send receipt
        </Button>
      </form>
    </div>
  );
}

function AccountCard({ account, label }: { account: WalletAccount; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-5">
      {account.qr_url && (
        <img
          src={account.qr_url}
          alt={`${label} QR code for ${account.account_name}`}
          className="size-40 rounded-md bg-white object-contain p-2"
        />
      )}
      <dl className="flex flex-col gap-3">
        <div>
          <dt className="text-sm text-line-dim">Account name</dt>
          <dd className="font-semibold">{account.account_name}</dd>
        </div>
        <div>
          <dt className="text-sm text-line-dim">{label} number</dt>
          <dd className="flex items-center gap-3">
            <span className="text-2xl font-bold font-condensed tracking-wide">{account.account_number}</span>
            <button
              type="button"
              onClick={() =>
                navigator.clipboard?.writeText(account.account_number).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-faint px-3 text-sm font-semibold hover:border-line-dim"
            >
              {copied ? (
                <Check className="size-4 text-ball" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </dd>
        </div>
      </dl>
    </div>
  );
}

function StatusCard({
  tone,
  title,
  children,
}: {
  tone: "good" | "wait" | "bad";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      role="status"
      className={cn(
        "rounded-lg border p-5 sm:p-6",
        tone === "good" && "border-court-outer-bright bg-court-outer/30",
        tone === "wait" && "border-dashed border-signal-amber/70 bg-court-surface",
        tone === "bad" && "border-signal-red/60 bg-signal-red/10",
      )}
    >
      <h2 className="flex items-center gap-2 text-xl font-expanded font-bold">
        {tone === "good" ? (
          <Check className="size-5 text-ball" aria-hidden />
        ) : tone === "wait" ? (
          <Hourglass className="size-5 text-signal-amber" aria-hidden />
        ) : null}
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
