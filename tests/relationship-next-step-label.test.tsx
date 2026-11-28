/**
 * #1358 — **the answering Next Step names what it resumes, and only speaks where the verb is true.**
 *
 * The founder's screenshot read **Next Step · Continue Your Assessment** over an active **Continue
 * Assessment** button on a relationship they described as *paused*, and asked the question this file
 * answers by state: *"I cannot continue the Assessment, since it is paused, right?"*
 *
 * The tree answered half of it already — the pause wins (`paused` drops the band, #1121) — and got
 * the other half wrong. #1100b writes a `session` row from the create commit onward, so a **draft**
 * relationship carries a `sessionRecordId`, and this band was drawn on it: *Continue Your
 * Assessment* over a **Continue Assessment** button whose address is the draft round's answer
 * sheet. `maySubmit("draft", …)` is false, so `lib/flow/answer-gate.ts` answers `readonly` with
 * `action: null`: the button opened a sheet with no form on it. That is the state the founder
 * could not continue, and the label named no round it could have resumed.
 *
 * So one claim per state, because one label alone is not enough to pass — the label is only right if
 * it is right *per state*, and the draft is where it was wrong:
 *
 *   draft           no answering control at all. The draft's one Next Step on this screen is the
 *                   Publish panel (`Publish and invite`), which is the act the draft waits for.
 *   live, 0         `Start Your First Assessment` / `Start Assessment` → the round's sheet.
 *   live, some      `Continue Your Assessment` / `Continue Assessment` → the round's sheet, with the
 *                   visible text as the accessible name (the anchor carries no `aria-label`).
 *   paused          no answering control — the founder's state, pinned so it cannot come back.
 *   both answered   no answering control — the Align summary owns the Next Step (#rect-04).
 *
 * The two draft views are built by hand rather than read from a fixture: `viewerAnswered: 2` on a
 * draft is a shape no read produces today (opinions need an open session), and it is asserted
 * precisely because it was the reachable-looking half of the bug — if a later card lets a draft
 * carry answers, the guard still has to hold.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The screen refreshes after a write, so it reads the router. No test here presses a button.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));

import { RelationshipDetail } from "@/components/dashboard/relationship-detail";
import { assessments } from "@/data/assessments";
import { dashboardRelationshipDetailPageCopy } from "@/data/pages/dashboard-relationship-detail";
import type { AspectAnswers, AlignmentSummary } from "@/lib/member/alignment-summary";
import { alignmentSummaryOf } from "@/lib/member/alignment-summary";
import type { MemberRelationshipView } from "@/lib/member/relationships";

const record = (() => {
  const found = assessments.find((entry) => entry.id === "assessment-relationship-basics");
  if (found === undefined) throw new Error("assessment-relationship-basics is not a fixture");
  return found;
})();

const SESSION = "assessment-instance-avery-rowan";
const SHEET = `/assessment/instances/${SESSION}/answer`;

/** One view per state, differing only in the facts that decide this band. */
function view(overrides: Partial<MemberRelationshipView> = {}): MemberRelationshipView {
  return {
    id: "relationship-1358",
    status: "active",
    viewerRole: "initiator",
    isInitiator: true,
    templateId: record.id,
    templateSlug: record.slug,
    title: record.title,
    relationshipTitle: "Avery B – Rowan",
    summary: record.summary,
    createdAt: "2026-10-28T18:30:00.000Z",
    publishedAt: "2026-10-29T12:00:00.000Z",
    sessionRecordId: SESSION,
    aspectCount: 5,
    viewerAnswered: 2,
    invite: { claimed: true, revoked: false, expiresAt: new Date("2026-11-12T12:00:00.000Z") },
    counterpartyName: "Rowan",
    counterpartySeatName: "Rowan",
    initiatorName: "Avery",
    view: "invite-claimed",
    membership: { state: "open", reason: null, endedAt: null, writable: true },
    template: record,
    aspectsEditable: false,
    publishable: false,
    completion: null,
    offersRepublish: false,
    trialWithoutLiveInvite: false,
    closed: false,
    trial: "active",
    trialEndsAt: "2026-11-05T12:00:00.000Z",
    lapseSentence: null,
    inviteLinkAvailable: false,
    canForkTemplate: false,
    ...overrides,
  };
}

/** A relationship nobody has been invited to yet: the session exists and is a **draft** (#1100b). */
function draft(overrides: Partial<MemberRelationshipView> = {}): MemberRelationshipView {
  return view({
    status: "draft",
    publishedAt: null,
    invite: null,
    view: "not-published",
    membership: { state: "open", reason: null, endedAt: null, writable: true },
    trial: "none",
    trialEndsAt: null,
    aspectsEditable: true,
    publishable: true,
    ...overrides,
  });
}

/** The trial-ended state the founder photographed: Stage 6 paused, answers on the round. */
function pausedView(overrides: Partial<MemberRelationshipView> = {}): MemberRelationshipView {
  return view({
    membership: { state: "lapsed", reason: "trial-ended", endedAt: null, writable: false },
    pause: {
      paused: true,
      state: "trial-ended",
      extended: false,
      extensionAvailable: true,
      daysLeft: null,
      endsAt: null,
    } as NonNullable<MemberRelationshipView["pause"]>,
    ...overrides,
  });
}

function html(relationship: MemberRelationshipView, align: AlignmentSummary | null = null): string {
  const noop = async () => ({ ok: true as const }) as never;
  return renderToStaticMarkup(
    createElement(RelationshipDetail, {
      copy: dashboardRelationshipDetailPageCopy,
      relationship,
      align,
      onSaveAspects: noop,
      onPublish: noop,
      onRepublish: noop,
      onComplete: noop,
      onFork: noop,
      onClaimExtension: noop,
      templatesHref: "/templates/relationship?view=mine",
    }),
  );
}

function textOf(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** The answering band's own markup, or `null` when the state draws none. */
function bandOf(markup: string): string | null {
  const start = markup.indexOf("data-next-step-assessment");
  if (start === -1) return null;
  const open = markup.lastIndexOf("<section", start);
  const close = markup.indexOf("</section>", start);
  return markup.slice(open, close);
}

/** The band's one control — `href`, the attributes on it, and the words it reads. */
function controlOf(band: string): { href: string; attrs: string; label: string } {
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/.exec(band);
  if (anchor === null) throw new Error("the answering band draws no control");
  return {
    href: /href="([^"]*)"/.exec(anchor[1])?.[1] ?? "",
    attrs: anchor[1],
    label: textOf(anchor[2]),
  };
}

describe("#1358 — a draft draws no answering control, because nothing can be answered yet", () => {
  it("draws no Next Step for the assessment on a draft relationship", () => {
    const markup = html(draft());
    const text = textOf(markup);

    expect(bandOf(markup)).toBeNull();
    /* Neither verb, in either half of the band: the heading or the button. */
    expect(text).not.toContain("Start Your First Assessment");
    expect(text).not.toContain("Start Assessment");
    expect(text).not.toContain("Continue Your Assessment");
    expect(text).not.toContain("Continue Assessment");
    /* And no door to a sheet with no form on it. */
    expect(markup).not.toContain(SHEET);
  });

  it("still draws no answering control when a draft somehow carries answers", () => {
    /*
     * The half of the bug that read as reachable: `answered > 0` flipped the word to *Continue* and
     * kept the same dead door. This shape is asserted so the guard is the relationship's state and
     * never the viewer's count — the count cannot make a draft round answerable.
     */
    const markup = html(draft({ viewerAnswered: 2 }));
    const text = textOf(markup);

    expect(bandOf(markup)).toBeNull();
    expect(text).not.toContain("Continue Your Assessment");
    expect(text).not.toContain("Continue Assessment");
    expect(markup).not.toContain(SHEET);
  });

  it("leaves the draft's one Next Step where it belongs — the Publish panel", () => {
    const text = textOf(html(draft()));

    /* `publishable` is what draws the panel's submit; the draft is waiting for that, not for answers. */
    expect(text).toContain("Publish");
    expect(text).toContain("Publish and invite");
  });
});

describe("#1358 — a live round keeps the verb its own answer sheet honours", () => {
  it("says Start while the viewer has answered nothing, and opens the round's sheet", () => {
    const markup = html(view({ viewerAnswered: 0 }));
    const band = bandOf(markup);
    expect(band).not.toBeNull();
    if (band === null) throw new Error("unreachable");

    expect(band).toContain('data-next-step-assessment="start"');
    expect(textOf(band)).toContain("Start Your First Assessment");

    const control = controlOf(band);
    expect(control.label).toBe("Start Assessment");
    expect(control.href).toBe(SHEET);
    /* The visible words are the accessible name — no `aria-label` renames the control. */
    expect(control.attrs).not.toContain("aria-label");
  });

  it("says Continue once the round has answers, names that round, and opens its sheet", () => {
    const markup = html(view({ viewerAnswered: 2 }));
    const band = bandOf(markup);
    expect(band).not.toBeNull();
    if (band === null) throw new Error("unreachable");

    expect(band).toContain('data-next-step-assessment="continue"');
    expect(textOf(band)).toContain("Continue Your Assessment");
    /* The count is the round's own — the same figure the sheet resumes from. */
    expect(textOf(band)).toContain("2 of 5 Aspects answered");

    const control = controlOf(band);
    expect(control.label).toBe("Continue Assessment");
    expect(control.href).toBe(SHEET);
    expect(control.attrs).not.toContain("aria-label");
  });
});

describe("#1358 — the states that must not draw it at all", () => {
  it("draws no answering control while Stage 6 is paused (the founder's screenshot)", () => {
    const markup = html(pausedView({ viewerAnswered: 2 }));
    const text = textOf(markup);

    expect(bandOf(markup)).toBeNull();
    expect(text).not.toContain("Continue Your Assessment");
    expect(text).not.toContain("Continue Assessment");
    /* The pause panel is what the state draws instead, and it says so in its own words. */
    expect(text).toContain("Paused");
  });

  it("draws no answering control once both sheets are in — Align owns that Next Step", () => {
    const sheets: readonly AspectAnswers[] = record.items.map((item, index) => ({
      itemId: item.id,
      position: index + 1,
      prompt: item.prompt,
      initiator: { feel: 3, wish: 3 },
      counterparty: { feel: 3, wish: 3 },
    }));
    const markup = html(view({ viewerAnswered: 5 }), alignmentSummaryOf("soft", sheets));

    expect(bandOf(markup)).toBeNull();
    expect(textOf(markup)).not.toContain("Continue Your Assessment");
    expect(textOf(markup)).toContain("Where You Agree, and Where You Differ");
  });
});
