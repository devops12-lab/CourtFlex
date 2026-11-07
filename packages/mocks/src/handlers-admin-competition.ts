// Super Admin: disputed results, rating corrections and rating rules (Phase 5, M5).
import { notify } from "./notify-db";
import { http } from "msw";
import type { AdminDispute, AdminRatingRow, RatingAdjustment, RatingRulesInput } from "@courtflex/api";
import { person, users } from "./db";
import { matches, type MockMatch } from "./match-db";
import {
  adjustRating,
  isProvisional,
  profileOf,
  ratingAdjustments,
  ratingRules,
  reverseMatchRatings,
} from "./rating-db";
import { completeMatch, replaceVoidedMatch, tmatches, tournaments } from "./tournament-db";
import { audit } from "./admin-db";
import { authorizeAdmin } from "./handlers-admin";
import { summary } from "./handlers-matches";
import { API, fail, invalid, latency, ok } from "./http-helpers";

const names = (m: MockMatch) =>
  m.teams
    .map((t) => t.map((id) => users.find((u) => u.id === id)?.name.split(" ")[0] ?? "Player").join(" & "))
    .join(" vs ");

function disputeView(m: MockMatch): AdminDispute {
  const t = tournaments.find((x) => x.id === m.tournament_id);
  const d = m.result!.dispute!;
  return {
    match: summary(m),
    dispute: { by: person(d.by), reason: d.reason, at: d.at },
    submitted_by: person(m.result!.submitted_by),
    tournament: t ? { id: t.id, name: t.name, slug: t.slug } : null,
    resolution: d.resolution ? { ...d.resolution, by: person(d.resolution.by) } : null,
  };
}

function voidMatch(m: MockMatch, by: string, reason: string) {
  const at = new Date().toISOString();
  m.status_history.push({ from: m.status, to: "voided", by, at, reason });
  m.status = "voided";
  m.void_reason = reason;
  m.ended_at ??= at;
  if (m.tournament_id) replaceVoidedMatch(m);
}

export const adminCompetitionHandlers = [
  // ── Disputes ───────────────────────────────────────────
  http.get(`${API}/admin/disputes`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const status = new URL(request.url).searchParams.get("status") ?? "open";
    const list = matches.filter((m) =>
      status === "open" ? m.status === "disputed" : !!m.result?.dispute?.resolution,
    );
    return ok(
      list
        .map(disputeView)
        .sort((a, b) =>
          status === "open"
            ? a.dispute.at.localeCompare(b.dispute.at)
            : b.resolution!.at.localeCompare(a.resolution!.at),
        ),
    );
  }),

  http.post(`${API}/admin/matches/:id/resolve`, async ({ params, request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const m = matches.find((x) => x.id === params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    if (m.status !== "disputed") return fail(409, "This result isn't disputed.");
    const body = (await request.json()) as { decision?: string; note?: string };
    const note = body.note?.trim() ?? "";
    if (body.decision !== "keep" && body.decision !== "void")
      return invalid({ decision: ["Keep the result or void the match."] });
    if (note.length < 10)
      return invalid({
        note: ["Explain the decision in a sentence (at least 10 characters). The players see it."],
      });
    const at = new Date().toISOString();
    m.result!.dispute!.resolution = { decision: body.decision, note, by: auth.user.id, at };
    if (body.decision === "keep") completeMatch(m, auth.user.id, at);
    else voidMatch(m, auth.user.id, note);
    for (const pid of m.teams.flat())
      notify(
        pid,
        "matches",
        "dispute_settled",
        body.decision === "keep" ? "Disputed result kept" : "Disputed match voided",
        `CourtFlex looked at the dispute: ${note}`,
        `/matches/${m.id}`,
        at,
      );
    audit(
      auth.user.id,
      `match.dispute_${body.decision === "keep" ? "kept" : "voided"}`,
      `${body.decision === "keep" ? "Kept" : "Voided"} the disputed result of ${names(m)}`,
      { type: "match", id: m.id, name: names(m) },
      note,
    );
    return ok(disputeView(m));
  }),

  http.post(`${API}/admin/matches/:id/reverse`, async ({ params, request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const m = matches.find((x) => x.id === params.id);
    if (!m) return fail(404, "This match doesn't exist.");
    if (m.status !== "completed") return fail(409, "Only an official result can be reversed.");
    const tm = m.tournament_id ? tmatches.find((x) => x.match_id === m.id) : undefined;
    if (tm) return fail(409, "This tournament match has already moved the draw on, so it can't be reversed.");
    const { reason } = (await request.json()) as { reason?: string };
    if ((reason?.trim().length ?? 0) < 10)
      return invalid({ reason: ["Say why in a sentence (at least 10 characters)."] });
    const undone = reverseMatchRatings(m.id);
    voidMatch(m, auth.user.id, reason!.trim());
    audit(
      auth.user.id,
      "match.reversed",
      `Reversed the result of ${names(m)}${undone ? ` and undid ${undone} rating changes` : ""}`,
      { type: "match", id: m.id, name: names(m) },
      reason!.trim(),
    );
    return ok({ reversed: m.id, rating_changes_undone: undone });
  }),

  // ── Ratings ────────────────────────────────────────────
  http.get(`${API}/admin/ratings`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
    const rows: AdminRatingRow[] = users
      .filter((u) => u.has_player_profile && (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)))
      .map((u) => {
        const s = profileOf(u.id, "singles");
        const d = profileOf(u.id, "doubles");
        return {
          player: { id: u.id, name: u.name, email: u.email, city: u.home_city },
          singles: { rating: s.rating, games: s.games, provisional: isProvisional(s) },
          doubles: { rating: d.rating, games: d.games, provisional: isProvisional(d) },
        };
      })
      .sort((a, b) => b.doubles.rating - a.doubles.rating)
      .slice(0, 50);
    return ok(rows);
  }),

  http.get(`${API}/admin/ratings/adjustments`, async () => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const list: RatingAdjustment[] = [...ratingAdjustments].reverse().map((a) => ({
      id: a.id,
      player: person(a.player_id),
      type: a.type,
      old: a.old,
      new: a.new,
      reason: a.reason,
      by: person(a.by),
      at: a.at,
    }));
    return ok(list);
  }),

  http.post(`${API}/admin/ratings/adjust`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const body = (await request.json()) as {
      player_id?: string;
      type?: string;
      rating?: number;
      reason?: string;
    };
    const u = users.find((x) => x.id === body.player_id && x.has_player_profile);
    const errors: Record<string, string[]> = {};
    if (!u) errors.player_id = ["Choose a player."];
    if (body.type !== "singles" && body.type !== "doubles") errors.type = ["Choose singles or doubles."];
    if (!Number.isInteger(body.rating) || body.rating! < 100 || body.rating! > 3000)
      errors.rating = ["Enter a whole number from 100 to 3,000."];
    const reason = body.reason?.trim() ?? "";
    if (reason.length < 10) errors.reason = ["Say why in a sentence (at least 10 characters)."];
    if (Object.keys(errors).length) return invalid(errors);
    const type = body.type as "singles" | "doubles";
    const before = profileOf(u!.id, type).rating;
    if (before === body.rating) return fail(409, `${u!.name}'s ${type} rating is already ${before}.`);
    adjustRating(u!.id, type, body.rating!, reason, auth.user.id);
    audit(
      auth.user.id,
      "rating.adjusted",
      `Changed ${u!.name}'s ${type} rating from ${before} to ${body.rating}`,
      { type: "user", id: u!.id, name: u!.name },
      reason,
    );
    return ok({ player_id: u!.id, type, old: before, new: body.rating });
  }),

  // ── Rules ──────────────────────────────────────────────
  http.get(`${API}/admin/rating-rules`, async () => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    return ok({ ...ratingRules });
  }),

  http.put(`${API}/admin/rating-rules`, async ({ request }) => {
    await latency();
    const auth = authorizeAdmin();
    if (auth.error) return auth.error;
    const b = (await request.json()) as Partial<RatingRulesInput>;
    const errors: Record<string, string[]> = {};
    const int = (v: unknown, lo: number, hi: number) =>
      Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
    if (!int(b.initial, 800, 2000)) errors.initial = ["Choose 800 to 2,000."];
    if (!int(b.provisional_matches, 1, 20)) errors.provisional_matches = ["Choose 1 to 20 matches."];
    if (!int(b.k_provisional, 8, 64)) errors.k_provisional = ["Choose 8 to 64."];
    if (!int(b.k_established, 8, 64)) errors.k_established = ["Choose 8 to 64."];
    if (!errors.k_provisional && !errors.k_established && b.k_established! > b.k_provisional!)
      errors.k_established = [
        "Make it no higher than the provisional K-factor: new players should move faster.",
      ];
    if (Object.keys(errors).length) return invalid(errors);
    const before = { ...ratingRules };
    Object.assign(ratingRules, {
      initial: b.initial,
      provisional_matches: b.provisional_matches,
      k_provisional: b.k_provisional,
      k_established: b.k_established,
    });
    const labels: Record<keyof RatingRulesInput, string> = {
      initial: "starting rating",
      provisional_matches: "matches to be ranked",
      k_provisional: "K-factor while provisional",
      k_established: "K-factor after",
    };
    const changes = (Object.keys(labels) as Array<keyof RatingRulesInput>)
      .filter((k) => before[k] !== ratingRules[k])
      .map((k) => `${labels[k]} ${before[k]} → ${ratingRules[k]}`);
    if (changes.length)
      audit(auth.user.id, "rating.rules_changed", `Changed rating rules: ${changes.join(", ")}`, {
        type: "settings",
        id: "rating-rules",
        name: "Rating rules",
      });
    return ok({ ...ratingRules });
  }),
];
