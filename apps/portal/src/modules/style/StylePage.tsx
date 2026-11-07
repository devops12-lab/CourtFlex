import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { BookingStatus, CalendarDay, PaymentStatus, SubscriptionStatus } from "@courtflex/api";
import { formatMoney } from "@courtflex/api";
import {
  BookingStatusBadge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  OfflineBanner,
  PaymentDot,
  PaymentStatusBadge,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  SubscriptionStatusBadge,
  Tabs,
  Textarea,
  useToast,
  Wordmark,
} from "@courtflex/ui";
import { CourtTimeline } from "../bookings/CourtTimeline";
import { CourtGrid } from "../bookings/CourtGrid";
import { MockControls } from "@courtflex/features";

const sections = [
  ["color", "Color"],
  ["type", "Type"],
  ["buttons", "Buttons"],
  ["forms", "Form fields"],
  ["tabs", "Tabs"],
  ["status", "Status"],
  ["tables", "Tables"],
  ["feedback", "Feedback states"],
  ["sheet", "Side panel"],
  ["courts", "Court board and calendar"],
  ["mocks", "Mock API controls"],
] as const;

const colors = [
  ["court-deep", "#001321", "App background, the night court"],
  ["court-surface", "#07233a", "Sidebars, panels, sheets"],
  ["court-raised", "#12395a", "Bookings on the board, hover, menus"],
  ["court-outer", "#1e4d45", "Open play and other green-court surfaces"],
  ["court-outer-bright", "#2e7366", "Borders on paid and active badges"],
  ["line", "#e9eef4", "Text and court lines"],
  ["line-dim", "#97a8bf", "Secondary text"],
  ["line-faint", "#1d4466", "Thin dividers, input borders"],
  ["ball", "#fcbf0e", "Logo gold: now, your selection, the one main action"],
  ["field", "#00d29a", "Logo green: confirmed, paid, active, done"],
  ["signal-amber", "#ff9440", "Pending, part paid, offline"],
  ["signal-red", "#ff6b5b", "Errors, no-shows, cancelling"],
] as const;

export function StylePage() {
  return (
    <div className="min-h-dvh">
      <OfflineBanner />
      <header className="flex h-16 items-center gap-4 border-b court-line px-5 sm:px-8">
        <Wordmark />
        <span className="text-line-dim">Design system</span>
        <Link
          to="/"
          className="ml-auto tap text-sm font-semibold text-line-dim underline underline-offset-4 hover:text-line"
        >
          Open the portal
        </Link>
      </header>

      <div className="mx-auto flex max-w-7xl gap-10 px-5 sm:px-8">
        <nav
          aria-label="Sections"
          className="sticky top-0 hidden h-dvh w-48 shrink-0 overflow-y-auto py-10 lg:block"
        >
          <ul className="flex flex-col gap-1 text-sm">
            {sections.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block rounded-sm px-2 py-1.5 text-line-dim hover:bg-court-surface hover:text-line"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 py-10">
          <h1 className="text-3xl font-expanded font-extrabold sm:text-4xl">Night session</h1>
          <p className="mt-3 max-w-prose text-line-dim">
            CourtFlex's design language: a floodlit court. Court-blue surfaces, white lines for structure, and
            ball gold only for what's live or yours. Every component below is the real one used in the app.
          </p>

          <Section id="color" title="Color">
            <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
              {colors.map(([name, hex, role]) => (
                <li key={name} className="flex items-center gap-3">
                  <span
                    className="size-12 shrink-0 rounded-sm border border-line-faint"
                    style={{ background: hex }}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">{name}</span>
                    <span className="block text-xs font-condensed text-line-dim">{hex}</span>
                    <span className="block text-sm text-line-dim">{role}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="type" title="Type">
            <p className="mb-6 max-w-prose text-line-dim">
              One family, Archivo, using its width axis: expanded for headings, normal for reading, condensed
              with tabular figures for times, scores and money.
            </p>
            <div className="flex flex-col gap-5">
              <Specimen label="Display, expanded 800, 3.05rem">
                <p className="text-4xl leading-tight font-expanded font-extrabold">Find a court tonight</p>
              </Specimen>
              <Specimen label="Page title, expanded 700, 1.95rem">
                <p className="text-2xl font-expanded font-bold">Wednesday, November 4</p>
              </Specimen>
              <Specimen label="Section, 600, 1.25rem">
                <p className="text-lg font-semibold">Up next</p>
              </Specimen>
              <Specimen label="Body, 400, 1rem">
                <p className="max-w-prose">
                  Payment is collected at the venue. Staff record cash, GCash or Maya when the player arrives.
                </p>
              </Specimen>
              <Specimen label="Numbers, condensed 700, tabular">
                <p className="text-4xl font-bold font-condensed">7:00 PM ₱1,750 11–7</p>
              </Specimen>
            </div>
          </Section>

          <Section id="buttons" title="Buttons">
            <p className="mb-5 max-w-prose text-line-dim">
              Primary is gold and appears once per screen. Labels say exactly what happens.
            </p>
            <div className="flex flex-col gap-5">
              <Row label="Variants">
                <Button variant="primary">Record payment</Button>
                <Button>Review payment</Button>
                <Button variant="ghost">Sign out</Button>
                <Button variant="danger">Cancel booking</Button>
              </Row>
              <Row label="Sizes">
                <Button variant="primary" size="sm">
                  Small
                </Button>
                <Button variant="primary">Medium</Button>
                <Button variant="primary" size="lg">
                  Large
                </Button>
              </Row>
              <Row label="States">
                <Button variant="primary" loading>
                  Saving
                </Button>
                <Button variant="primary" disabled>
                  Disabled
                </Button>
                <Button disabled>Disabled</Button>
              </Row>
            </div>
          </Section>

          <Section id="forms" title="Form fields">
            <FormsDemo />
          </Section>

          <Section id="tabs" title="Tabs">
            <TabsDemo />
          </Section>

          <Section id="status" title="Status">
            <p className="mb-5 max-w-prose text-line-dim">
              Booking status and payment status are always separate. Each pairs color with a line style or a
              coin shape so it reads without color.
            </p>
            <div className="flex flex-col gap-5">
              <Row label="Booking">
                {(
                  ["pending", "confirmed", "completed", "cancelled", "expired", "no_show"] as BookingStatus[]
                ).map((s) => (
                  <BookingStatusBadge key={s} status={s} />
                ))}
              </Row>
              <Row label="Payment">
                {(["unpaid", "partially_paid", "paid", "refunded", "voided"] as PaymentStatus[]).map((s) => (
                  <PaymentStatusBadge key={s} status={s} />
                ))}
              </Row>
              <Row label="Coins">
                {(["unpaid", "partially_paid", "paid", "refunded"] as PaymentStatus[]).map((s) => (
                  <PaymentDot key={s} status={s} className="size-5" />
                ))}
              </Row>
              <Row label="Subscription">
                {(
                  [
                    "trialing",
                    "active",
                    "past_due",
                    "grace_period",
                    "cancelled",
                    "expired",
                    "suspended",
                  ] as SubscriptionStatus[]
                ).map((s) => (
                  <SubscriptionStatusBadge key={s} status={s} />
                ))}
              </Row>
            </div>
          </Section>

          <Section id="tables" title="Tables">
            <TablesDemo />
          </Section>

          <Section id="feedback" title="Feedback states">
            <FeedbackDemo />
          </Section>

          <Section id="sheet" title="Side panel">
            <SheetDemo />
          </Section>

          <Section id="courts" title="Court board and calendar">
            <CourtsDemo />
          </Section>

          <Section id="mocks" title="Mock API controls">
            <p className="mb-5 max-w-prose text-line-dim">
              The same controls are in the portal's corner while the mock API is running.
            </p>
            <MockControls inline />
          </Section>
        </main>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-14 scroll-mt-6 border-t-2 border-line pt-6">
      <h2 id={`${id}-h`} className="mb-6 text-xl font-expanded font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b court-line pb-4">
      <p className="mb-1 text-xs text-line-dim">{label}</p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
      <p className="w-28 shrink-0 text-sm text-line-dim">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function FormsDemo() {
  const [length, setLength] = useState<"60" | "90" | "120">("60");
  return (
    <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
      <Field label="Guest name" hint="As they'd like it on the booking.">
        {(p) => <Input {...p} defaultValue="Lorna Castillo" />}
      </Field>
      <Field label="Amount collected" error="The balance is only ₱400.">
        {(p) => <Input {...p} defaultValue="500" inputMode="decimal" className="font-condensed" />}
      </Field>
      <Field label="Court">
        {(p) => (
          <Select {...p} defaultValue="c2">
            <option value="c1">Court 1</option>
            <option value="c2">Court 2</option>
            <option value="c3">Court 3</option>
          </Select>
        )}
      </Field>
      <Field label="Disabled">{(p) => <Input {...p} disabled defaultValue="Not editable" />}</Field>
      <Field label="Notes (optional)" className="sm:col-span-2">
        {(p) => <Textarea {...p} placeholder="Renting 2 paddles" />}
      </Field>
      <Segmented
        label="Length"
        value={length}
        onChange={setLength}
        className="sm:col-span-2"
        options={[
          { value: "60", label: "1 h" },
          { value: "90", label: "1.5 h" },
          { value: "120", label: "2 h" },
          { value: "180" as "120", label: "3 h", disabled: true },
        ]}
      />
    </div>
  );
}

function TabsDemo() {
  const [tab, setTab] = useState<"upcoming" | "past" | "cancelled" | "no_show">("upcoming");
  return (
    <Tabs
      label="Bookings"
      value={tab}
      onChange={setTab}
      items={[
        { value: "upcoming", label: "Upcoming", count: 5 },
        { value: "past", label: "Past", count: 12 },
        { value: "cancelled", label: "Cancelled", count: 1 },
        { value: "no_show", label: "No-show", count: 0, disabled: true },
      ]}
    >
      {(v) => (
        <p className="text-line-dim">
          {v === "upcoming"
            ? "5 bookings from today on."
            : v === "past"
              ? "12 completed bookings."
              : "1 cancelled booking."}{" "}
          Use the arrow keys to move between tabs.
        </p>
      )}
    </Tabs>
  );
}

const invoices = [
  { id: "1", number: "CF-INV-2026-0112", due: "Nov 8, 2026", status: "Issued", amount: "990.00" },
  { id: "2", number: "CF-INV-2026-0087", due: "Oct 8, 2026", status: "Paid Oct 3, 2026", amount: "990.00" },
  { id: "3", number: "CF-INV-2026-0051", due: "Sep 8, 2026", status: "Paid Sep 2, 2026", amount: "990.00" },
];

function TablesDemo() {
  const toast = useToast();
  const columns = [
    {
      key: "n",
      header: "Invoice",
      cell: (r: (typeof invoices)[number]) => <span className="font-condensed">{r.number}</span>,
    },
    { key: "d", header: "Due", cell: (r: (typeof invoices)[number]) => r.due, hideOnMobile: true },
    { key: "s", header: "Status", cell: (r: (typeof invoices)[number]) => r.status },
    {
      key: "a",
      header: "Amount",
      numeric: true,
      cell: (r: (typeof invoices)[number]) => formatMoney(r.amount),
    },
  ];
  return (
    <div className="flex flex-col gap-10">
      <DataTable
        caption="Example invoices"
        columns={columns}
        rows={invoices}
        rowKey={(r) => r.id}
        onRowClick={(r) => toast({ tone: "success", message: `Opened ${r.number}` })}
        rowActionLabel={(r) => `Open invoice ${r.number}`}
        minWidth={360}
      />
      <div>
        <p className="mb-2 text-sm text-line-dim">Loading</p>
        <DataTable
          caption="Loading example"
          columns={columns}
          rows={undefined}
          rowKey={(r) => r.id}
          loading
          minWidth={360}
        />
      </div>
      <div>
        <p className="mb-2 text-sm text-line-dim">Empty</p>
        <DataTable
          caption="Empty example"
          columns={columns}
          rows={[]}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              title="No invoices yet"
              body="The trial is free. The first invoice is issued when it ends."
            />
          }
        />
      </div>
    </div>
  );
}

function FeedbackDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-8">
      <Row label="Toasts">
        <Button
          onClick={() => toast({ tone: "success", message: "Payment recorded: ₱400 from Jamie Player." })}
        >
          Show success
        </Button>
        <Button
          onClick={() => toast({ tone: "error", message: "Court 2 was just booked. Choose another time." })}
        >
          Show error
        </Button>
      </Row>
      <div>
        <p className="mb-2 text-sm text-line-dim">Loading</p>
        <div className="flex max-w-md flex-col gap-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24" />
        </div>
      </div>
      <EmptyState
        title="No more bookings today"
        body="Every remaining court hour is open. Walk-ins can be added from here."
        action={<Button size="sm">New walk-in</Button>}
      />
      <ErrorState message="Can't reach CourtFlex. Check your connection and try again." onRetry={() => {}} />
      <div>
        <p className="mb-2 text-sm text-line-dim">
          Offline banner (appears at the top of every page when offline)
        </p>
        <div className="flex items-center gap-2 bg-signal-amber px-4 py-2 text-sm font-semibold text-[#2a1d00]">
          You're offline. Bookings and payments are paused until you reconnect, and what you see may be out of
          date.
        </div>
      </div>
    </div>
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="mb-4 max-w-prose text-line-dim">
        Slides in from the right on wide screens and up from the bottom on phones. Escape or the backdrop
        closes it.
      </p>
      <Button onClick={() => setOpen(true)}>Open side panel</Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Jamie Player"
        description="CF-4116. Walk-in at the front desk."
        footer={
          <Button variant="primary" size="lg" className="w-full" onClick={() => setOpen(false)}>
            Record payment
          </Button>
        }
      >
        <p className="text-4xl font-bold font-condensed">7:00 PM – 8:00 PM</p>
        <p className="mt-2 text-line-dim">Court 2, Wednesday, November 4</p>
      </Sheet>
    </>
  );
}

// A fixed sample day so the court components can be seen without signing in.
const TZ = "Asia/Manila";
const at = (hm: string) => new Date(`2026-11-04T${hm}:00+08:00`).toISOString();
const sampleCourts = [
  { id: "s1", name: "Court 1", indoor_outdoor: "outdoor", surface_type: "Acrylic" },
  { id: "s2", name: "Court 2", indoor_outdoor: "indoor", surface_type: "Sport tile" },
  { id: "s3", name: "Court 3", indoor_outdoor: "outdoor", surface_type: "Acrylic" },
].map(
  (c) =>
    ({
      ...c,
      club_id: "x",
      court_code: c.id,
      base_price: "300.00",
      currency: "PHP",
      status: "active",
    }) as CalendarDay["courts"][number],
);

function sampleBooking(
  id: string,
  court: string,
  from: string,
  to: string,
  name: string,
  pay: PaymentStatus,
  status: BookingStatus = "confirmed",
) {
  return {
    reservation_id: `r-${id}`,
    court_id: court,
    reservation_type: "booking" as const,
    starts_at: at(from),
    ends_at: at(to),
    status: "confirmed" as const,
    label: name,
    booking: {
      id,
      club_id: "x",
      court_id: court,
      reservation_id: `r-${id}`,
      booking_code: `CF-${id}`,
      source: "player_app" as const,
      starts_at: at(from),
      ends_at: at(to),
      status,
      payment_status: pay,
      subtotal: "400.00",
      discount: "0.00",
      total: "400.00",
      amount_paid: pay === "paid" ? "400.00" : "0.00",
      balance_due: pay === "paid" ? "0.00" : "400.00",
      currency: "PHP" as const,
      player: { id: "p", name },
      guest_name: null,
      guest_phone: null,
      guest_email: null,
      notes: null,
      created_by: { id: "p", name },
      created_at: at("06:00"),
      payment_method: "pay_at_court" as const,
      hold_expires_at: null,
      receipt: null,
    },
  };
}

const sampleDay: CalendarDay = {
  date: "2026-11-04",
  opens_at: at("06:00"),
  closes_at: at("22:00"),
  courts: sampleCourts,
  blocks: [
    sampleBooking("1", "s1", "07:00", "08:00", "Miguel Reyes", "paid"),
    sampleBooking("2", "s1", "18:00", "19:00", "Jamie Player", "unpaid"),
    sampleBooking("3", "s2", "09:00", "10:30", "Andrea Santos", "partially_paid"),
    sampleBooking("4", "s2", "19:00", "20:00", "Paolo Villanueva", "unpaid", "pending"),
    {
      reservation_id: "m",
      court_id: "s3",
      reservation_type: "maintenance",
      starts_at: at("07:00"),
      ends_at: at("09:00"),
      status: "confirmed",
      label: "Line repainting",
      booking: null,
    },
    {
      reservation_id: "o",
      court_id: "s3",
      reservation_type: "open_play",
      starts_at: at("17:30"),
      ends_at: at("19:30"),
      status: "confirmed",
      label: "Social open play, 6 of 8 joined",
      booking: null,
    },
  ],
  closures: [{ court_id: "s2", starts_at: at("21:00"), ends_at: at("22:00"), reason: "Closed" }],
};

function CourtsDemo() {
  const toast = useToast();
  const open = (id: string) => toast({ tone: "success", message: `Would open booking CF-${id}` });
  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="mb-3 max-w-prose text-line-dim">
          Court board: one lane per court. A gold line marks the current time on today's board.
        </p>
        <CourtTimeline day={sampleDay} timeZone={TZ} onOpenBooking={open} />
      </div>
      <div>
        <p className="mb-3 max-w-prose text-line-dim">
          Calendar: courts side by side. Empty time can be tapped to start a walk-in.
        </p>
        <div className="max-h-[420px] overflow-y-auto">
          <CourtGrid
            day={sampleDay}
            timeZone={TZ}
            onOpenBooking={open}
            onPickSlot={(court, startsAt) =>
              toast({ tone: "success", message: `Would start a walk-in on ${court} at ${startsAt}` })
            }
          />
        </div>
      </div>
    </div>
  );
}
