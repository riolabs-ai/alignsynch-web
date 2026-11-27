/**
 * The project spec's reader (#1252) — the register, the submenu, the matrix, the story page and the
 * honest panel.
 *
 * **What these cases are for.** The card's acceptance names four behaviours and a set of rules that
 * a screenshot cannot check: the pinned group's `aria-expanded`, the four section counts, a story
 * page rendering its four bands, the missing-file panel, the absence of red, and the absence of
 * agreement quotes in the committed register. Each is a separate case below, and the counts are
 * read from `data/spec/validation.json` — the same file the page reads — so a regenerated register
 * that changes a figure fails here instead of silently rewriting the page.
 *
 * The register's own figures (28 / 20 / 13 / 27, 44 of 76 met, the four scope meters) are pinned
 * **here and not in `data:check`**: they are the agreement's numbers, they move when the agreement
 * moves, and a diff that changes them should be reviewed rather than blocked. `data:check` E42
 * pins the properties that must never change — schema, unique IDs, every group reachable,
 * quote-free — and this file pins today's totals.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpecFrame } from "@/components/admin/spec/spec-frame";
import { SpecNotice } from "@/components/admin/spec/spec-notice";
import { SpecSubmenu } from "@/components/admin/spec/spec-submenu";
import { SpecStatusBox } from "@/components/admin/spec/spec-status-box";
import { StoryPage } from "@/components/admin/spec/story-page";
import { ValidationMatrix } from "@/components/admin/spec/validation-matrix";
import {
  SPEC_STATUS_MARKS,
  SPEC_STATUSES,
  SPEC_STORY_GROUPS,
  specBeyondRows,
  specSectionsOf,
  specStoryRows,
  specTotalsOf,
  type SpecValidation,
} from "@/content/spec";
import { adminSpecPageCopy } from "@/data/pages/admin-spec";
import {
  readSpecValidation,
  readSpecValidationSafe,
  SpecUnreadable,
  SPEC_VALIDATION_SOURCE,
} from "@/lib/spec/file";
import { specDateLabel, specEvidenceLink } from "@/lib/spec/evidence";
import { specIssuesOf, type SpecIssuesReady } from "@/lib/spec/issues";

const copy = adminSpecPageCopy;

/** The committed register, through the same reader the page uses. */
function register(): SpecValidation {
  return readSpecValidation();
}

/** Every class token in a rendered tree — the surface's whole vocabulary of colour. */
function classes(markup: string): string[] {
  return [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/));
}

describe("the register", () => {
  it("reads 88 rows, and the four section counts are the agreement's own", () => {
    const doc = register();
    expect(doc.rows.length).toBe(88);
    expect(specSectionsOf(doc.rows).map((section) => section.rows)).toEqual([28, 20, 13, 27]);
  });

  it("counts 44 of 76 met, over the eleven stories and not the twelve beyond them", () => {
    const doc = register();
    const storyRows = specStoryRows(doc);
    expect(specBeyondRows(doc).length).toBe(12);
    expect(storyRows.length).toBe(76);
    expect(specTotalsOf(storyRows)).toEqual({ met: 44, total: 76, percent: 58 });
  });

  it("carries the four scopes the status box meters", () => {
    const doc = register();
    const storyRows = specStoryRows(doc);
    const scopeOf = (prefix: string) =>
      specTotalsOf(storyRows.filter((row) => row.id.startsWith(`${prefix}-`)));
    expect(scopeOf("WEB")).toMatchObject({ met: 7, total: 13 });
    expect(scopeOf("APP")).toMatchObject({ met: 30, total: 50 });
    expect(scopeOf("ADMIN")).toMatchObject({ met: 5, total: 7 });
    expect(scopeOf("OPS")).toMatchObject({ met: 2, total: 6 });
  });

  it("gives every one of the eleven stories at least one row", () => {
    const doc = register();
    expect(SPEC_STORY_GROUPS.length).toBe(11);
    for (const story of SPEC_STORY_GROUPS) {
      expect(
        doc.rows.filter((row) => row.group === story.name).length,
        `${story.name} has no row`,
      ).toBeGreaterThan(0);
    }
  });

  it("is the quote-free projection — no quote value, and no file that could carry one", () => {
    const text = readFileSync(join(process.cwd(), SPEC_VALIDATION_SOURCE), "utf8");
    const doc = register();
    expect(doc.quotesIncluded).toBe(false);
    expect(doc.rows.every((row) => row.quote === null)).toBe(true);
    expect(text).toContain('"quotesIncluded": false');
    expect(text.match(/"quote": null/g)?.length).toBe(doc.rows.length);
    // The one shape that would mean somebody committed the private file.
    expect(text).not.toContain('"quotesIncluded": true');
  });
});

describe("the submenu", () => {
  it("pins Validation with aria-expanded and offers no control that could collapse it", () => {
    const markup = renderToStaticMarkup(
      createElement(SpecSubmenu, { copy, doc: register(), current: { kind: "validation" } }),
    );
    const pinned = markup.slice(markup.indexOf("data-pinned"));
    expect(pinned).toContain('aria-expanded="true"');
    // The group, the rail and the page: no disclosure anywhere in this navigation.
    expect(markup).not.toContain("<button");
    expect(markup.match(/aria-expanded/g)?.length).toBe(1);
  });

  it("marks the current page, and only it", () => {
    const doc = register();
    const validation = renderToStaticMarkup(
      createElement(SpecSubmenu, { copy, doc, current: { kind: "validation" } }),
    );
    expect(validation.match(/aria-current="page"/g)?.length).toBe(1);
    expect(validation).toMatch(
      /aria-expanded="true"[^>]*aria-current="page"|aria-current="page"[^>]*aria-expanded="true"/,
    );

    const story = renderToStaticMarkup(
      createElement(SpecSubmenu, {
        copy,
        doc,
        current: { kind: "story", slug: "07-plans-and-billing" },
      }),
    );
    expect(story.match(/aria-current="page"/g)?.length).toBe(1);
    const current = story.split("<").find((tag) => tag.includes('aria-current="page"')) ?? "";
    expect(current).toContain("07-plans-and-billing");
  });

  it("lists the eleven stories in the agreement's order, each with its met/total", () => {
    const markup = renderToStaticMarkup(
      createElement(SpecSubmenu, { copy, doc: register(), current: { kind: "overview" } }),
    );
    const order = [...markup.matchAll(/data-spec-story="([^"]+)"/g)].map((match) => match[1]);
    expect(order).toEqual(SPEC_STORY_GROUPS.map((story) => story.slug));
    // Validation's own count, then one row's — 44 of the 76 story rows, and 5 of Plans and Billing's 7.
    expect(markup).toContain("44/76");
    expect(markup).toContain("5/7");
  });
  it("lets a long story label wrap rather than cutting it or widening the column", () => {
    const doc = register();
    const column = renderToStaticMarkup(
      createElement(SpecSubmenu, { copy, doc, current: { kind: "overview" } }),
    );
    const sheet = renderToStaticMarkup(
      createElement(SpecSubmenu, {
        copy,
        doc,
        current: { kind: "overview" },
        surface: "sheet",
      }),
    );

    /**
     * `truncate` cut "08 Coaches and Professionals" to an ellipsis **and** — being
     * `white-space: nowrap` — gave every row a min-content width equal to its whole sentence, so
     * the rows refused to shrink inside the column (246px of rows in a 208px column, measured).
     * `min-w-0` on the label is what lets the row be the column's width and the label wrap.
     */
    for (const markup of [column, sheet]) {
      expect(markup).not.toContain("truncate");
      expect(markup).toContain('class="min-w-0 leading-5"');
    }
  });

  it("draws 44px rows in the drawer and the artifact's 6px rows in the column", () => {
    const doc = register();
    const rowClasses = (markup: string) =>
      [...markup.matchAll(/class="([^"]*)"[^>]*data-spec-story="/g)].map((match) =>
        match[1].split(/\s+/),
      );

    const column = rowClasses(
      renderToStaticMarkup(
        createElement(SpecSubmenu, { copy, doc, current: { kind: "overview" } }),
      ),
    );
    const sheet = rowClasses(
      renderToStaticMarkup(
        createElement(SpecSubmenu, {
          copy,
          doc,
          current: { kind: "overview" },
          surface: "sheet",
        }),
      ),
    );

    expect(column.length).toBe(SPEC_STORY_GROUPS.length);
    expect(sheet.length).toBe(SPEC_STORY_GROUPS.length);
    // `py-1.5` is `css/admin-project-spec.css:54`; `py-3` is 12 + a 20px line + 12 = 44px.
    for (const tokens of column) expect(tokens).toContain("py-1.5");
    for (const tokens of sheet) {
      expect(tokens).toContain("py-3");
      expect(tokens).toContain("focus-visible:ring-2");
    }
  });
});

describe("the Validation matrix", () => {
  it("draws the four sections in order with 28 / 20 / 13 / 27 rows", () => {
    const markup = renderToStaticMarkup(createElement(ValidationMatrix, { copy, doc: register() }));
    const sections = [
      ...markup.matchAll(/data-spec-section="(\d+)" data-spec-section-rows="(\d+)"/g),
    ];
    expect(sections.map((match) => [match[1], match[2]])).toEqual([
      ["1", "28"],
      ["2", "20"],
      ["3", "13"],
      ["4", "27"],
    ]);
    expect(markup.match(/data-spec-row="/g)?.length).toBe(88);
  });

  it("draws every status as an icon plus a word, never colour alone", () => {
    const markup = renderToStaticMarkup(createElement(ValidationMatrix, { copy, doc: register() }));
    const chips = [...markup.matchAll(/data-spec-status="([^"]+)"/g)].map((match) => match[1]);
    // One chip per row, plus the six-status legend the matrix heads its right column with.
    expect(chips.length).toBe(register().rows.length + 6);
    for (const status of chips) {
      // A word, not a token: the chip carries the register's own status name, spaces and all.
      expect(status).toMatch(/^[A-Z][A-Za-z -]+$/);
      expect(SPEC_STATUSES).toContain(status);
    }
    // The mark and the word in the same chip: the glyphs are the fixture's record of them.
    for (const mark of Object.values(SPEC_STATUS_MARKS)) {
      expect(markup).toContain(mark);
    }
    // Review and approval are Pending, in words.
    expect(markup).toContain("Pending");
  });

  it("links every code citation to main at the register's recorded sha", () => {
    const doc = register();
    const main = doc.register.main;
    const markup = renderToStaticMarkup(createElement(ValidationMatrix, { copy, doc }));
    const cited = [...markup.matchAll(/href="(https:\/\/github\.com\/[^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(cited.length).toBeGreaterThan(0);
    for (const href of cited) {
      expect(href).toContain(`/blob/${main}/`);
    }
    // A citation with a line becomes an anchor, and one without stays a bare path.
    expect(specEvidenceLink({ kind: "code", ref: "lib/x.ts:12" }, main).href).toBe(
      `https://github.com/riolabs-ai/alignsynch/blob/${main}/lib/x.ts#L12`,
    );
    expect(specEvidenceLink({ kind: "code", ref: "lib/x.ts" }, main).href).toBe(
      `https://github.com/riolabs-ai/alignsynch/blob/${main}/lib/x.ts`,
    );
  });

  it("uses no red hue anywhere in the rendered tree", () => {
    const markup = renderToStaticMarkup(createElement(ValidationMatrix, { copy, doc: register() }));
    const red = classes(markup).filter((token) =>
      /\b(?:bg|text|border|ring|from|to)-(red|rose)\b/.test(token),
    );
    expect(red).toEqual([]);
  });

  it("draws its chips with the shared primitive, and a tone on top of it", () => {
    const markup = renderToStaticMarkup(createElement(ValidationMatrix, { copy, doc: register() }));
    const chips = [...markup.matchAll(/class="([^"]*)" data-spec-status="([^"]+)"/g)];
    expect(chips.length).toBeGreaterThan(0);
    for (const [, classList, status] of chips) {
      const tokens = classList.split(/\s+/);
      // `components/ui/badge.tsx`'s base string: one radius, one padding, one type step.
      expect(tokens).toContain("rounded-full");
      expect(tokens).toContain("px-2.5");
      expect(tokens).toContain("text-xs");
      // …and the filled default's white type must be gone, or the word vanishes on the tint.
      expect(tokens).not.toContain("text-white");
      expect(classList).toContain("bg-");
      expect(
        tokens.some((token) =>
          /^(bg|text|border)-(synch|deep|pale|small-gap|gap|counterparty|background|muted)/.test(
            token,
          ),
        ),
        `${status} carries no status tone`,
      ).toBe(true);
    }
  });
});

describe("a story page", () => {
  it("renders its four bands in the agreement's order", () => {
    const doc = register();
    const story = SPEC_STORY_GROUPS.find((group) => group.name === "Plans and Billing");
    expect(story).toBeDefined();
    const markup = renderToStaticMarkup(
      createElement(StoryPage, { copy, doc, story: story ?? null }),
    );
    expect(markup).toContain("Plans and Billing");
    const order = ["Agreed", "v2.0 Today", "Status", "Evidence"].map((heading) =>
      markup.indexOf(`>${heading}<`),
    );
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The group's own chips are its counts: Delivered 2 · Partial 1 · Offset 3 · Tentative 1.
    expect(markup).toContain("Delivered 2");
    expect(markup).toContain("Offset 3");
  });

  it("says the agreement holds no mockup rather than leaving the panel blank", () => {
    const doc = register();
    const story = SPEC_STORY_GROUPS[6];
    const markup = renderToStaticMarkup(createElement(StoryPage, { copy, doc, story }));
    expect(markup).toContain("No mockup in the agreement for this group.");
  });

  it("answers an unknown segment with a page, not the gate's 404", () => {
    const markup = renderToStaticMarkup(
      createElement(StoryPage, { copy, doc: register(), story: null }),
    );
    expect(markup).toContain("No story page is called");
    expect(markup).toContain("/admin/spec/validation");
  });
});

describe("the honest panel", () => {
  it("names the path and the reason, and offers a way on", () => {
    const markup = renderToStaticMarkup(
      createElement(SpecNotice, {
        copy,
        path: SPEC_VALIDATION_SOURCE,
        reason: "Not Found — the file is not present in this tree",
      }),
    );
    expect(markup).toContain("data/spec/validation.json");
    expect(markup).toContain("Not Found");
    expect(markup).toContain("spec-scope-v2/VALIDATION.csv");
    expect(markup).toContain("/how-it-works");
  });

  it("is what a missing register produces, and a malformed one names the field", () => {
    const dir = mkdtempSync(join(tmpdir(), "spec-register-"));
    const missing = readSpecValidationSafe();
    expect(missing.doc).not.toBeNull();
    expect(missing.reason).toBeNull();

    expect(() => readSpecValidation(join(dir, "absent.json"))).toThrow(SpecUnreadable);
    const missingRead = (() => {
      try {
        readSpecValidation(join(dir, "absent.json"));
      } catch (error) {
        return error instanceof SpecUnreadable ? error.reason : "wrong error";
      }
      return "no throw";
    })();
    expect(missingRead).toContain("Not Found");

    const broken = join(dir, "broken.json");
    const doc = register();
    writeFileSync(broken, JSON.stringify({ ...doc, rows: [{ ...doc.rows[0], status: "Absent" }] }));
    const brokenRead = (() => {
      try {
        readSpecValidation(broken);
      } catch (error) {
        return error instanceof SpecUnreadable ? error.reason : "wrong error";
      }
      return "no throw";
    })();
    expect(brokenRead).toContain("rows.0.status");
  });
});

describe("the frame", () => {
  it("draws the confidentiality line on every depth", () => {
    for (const current of [
      { kind: "overview" as const },
      { kind: "validation" as const },
      { kind: "story" as const, slug: "07-plans-and-billing" },
    ]) {
      const markup = renderToStaticMarkup(
        createElement(SpecFrame, { copy, doc: register(), current }, createElement("p", null, "x")),
      );
      expect(markup).toContain("Consulting Agreement (NDA, Exhibit C)");
      expect(markup).toContain("data-spec-submenu=");
    }
  });

  it("draws the confidentiality line in the artifact's initiator tone, not a status colour", () => {
    const markup = renderToStaticMarkup(
      createElement(
        SpecFrame,
        { copy, doc: register(), current: { kind: "overview" as const } },
        createElement("p", null, "x"),
      ),
    );
    const note = markup.match(/role="note" class="([^"]*)"/);
    expect(note).not.toBeNull();
    const tokens = (note?.[1] ?? "").split(/\s+/);
    // `css/admin-project-spec.css:65` — `.nda` is `--initiator-line` over `--initiator-tint`.
    expect(tokens).toContain("border-initiator-line");
    expect(tokens).toContain("bg-initiator-tint");
    // It used to borrow the partial status's ochre, which is the one drift the brand-class lint
    // cannot see: both sides are tokens.
    expect(tokens.some((token) => token.includes("small-gap"))).toBe(false);
  });

  it("draws no submenu when the register could not be read", () => {
    const markup = renderToStaticMarkup(
      createElement(
        SpecFrame,
        { copy, doc: null, current: { kind: "overview" as const } },
        createElement("p", null, "x"),
      ),
    );
    expect(markup).not.toContain("data-spec-submenu=");
    expect(markup).toContain("Consulting Agreement (NDA, Exhibit C)");
  });
});

/**
 * The version-identity check (#1439) — **the assertion is on the printed string**, not on the data
 * file, because the defect was a component printing the register's `release` where a reader reads
 * the app's version: the surface said `2.0.0-rc1.2` beside a `2.1.0` build, and every gate stayed
 * green because nothing read the markup.
 *
 * `APP_VERSION` is the value `next.config.mjs` inlines from `package.json` at build time, so the
 * case sets it from `package.json` — the same pair a built artifact carries — and then demands
 * that each admin spec surface print exactly that version, and that the register's release appears
 * only under the register's own label.
 */
describe("the two identities", () => {
  /** `package.json`, read here rather than imported: this is the version a build would inline. */
  function packageVersion(): string {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };
    return pkg.version;
  }

  /** Run `body` with the build-time version set, as `next build` would set it. */
  function asBuilt<T>(body: () => T): T {
    const previous = process.env.APP_VERSION;
    process.env.APP_VERSION = packageVersion();
    try {
      return body();
    } finally {
      if (previous === undefined) delete process.env.APP_VERSION;
      else process.env.APP_VERSION = previous;
    }
  }

  /** An element's own text, tags stripped — what a reader sees inside it. */
  function textOf(markup: string, pattern: RegExp): string | null {
    const match = markup.match(pattern);
    return match === null ? null : match[1].replace(/<[^>]+>/g, "").trim();
  }

  it("prints package.json's version as the app's, and the register's release as the register's", () => {
    const version = packageVersion();
    const doc = register();

    const statusBox = asBuilt(() =>
      renderToStaticMarkup(createElement(SpecStatusBox, { copy, doc })),
    );
    const app = textOf(statusBox, /data-spec-app-version="[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    expect(app).not.toBeNull();
    // The app's line: this build's version, from package.json and nothing else.
    expect(app).toContain(`App ${version}`);
    expect(app?.startsWith(`App ${version}`)).toBe(true);
    // …and never the register's release, which is the bug this case exists to catch.
    expect(app).not.toContain(doc.register.release);

    const registerLine = textOf(statusBox, /data-spec-register="[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    expect(registerLine).not.toBeNull();
    expect(registerLine).toContain(doc.register.release);
    expect(registerLine).toContain(specDateLabel(doc.register.generatedAt));
    expect(registerLine).toContain(`@${doc.register.main}`);
    expect(registerLine).toContain(`VALIDATION.csv@${doc.register.csvSha256.slice(0, 8)}`);
    // Two facts, two labels: the panel does not merge them into one line.
    expect(registerLine).not.toBe(app);

    // The rail's subtitle is the app's version too — it read `doc.release` before this card.
    const frame = asBuilt(() =>
      renderToStaticMarkup(
        createElement(
          SpecFrame,
          { copy, doc, current: { kind: "validation" as const } },
          createElement("p", null, "x"),
        ),
      ),
    );
    expect(frame).toContain(`v${version} · Read-only`);
    expect(frame).not.toContain(`v${doc.register.release} · Read-only`);
  });

  it("says which half is a snapshot and which half is live", () => {
    const markup = renderToStaticMarkup(createElement(ValidationMatrix, { copy, doc: register() }));
    // The matrix: a register snapshot, and it says so in visible copy.
    const snapshot = textOf(markup, /data-spec-snapshot-notice[^>]*>([\s\S]*?)<\/p>/);
    expect(snapshot).toContain("Register snapshot");
    expect(snapshot).toContain("VALIDATION.csv");
    expect(snapshot).toContain("not live from GitHub");
    // The issue column: live, with its cache window stated.
    const live = textOf(markup, /data-spec-issues-live[^>]*>([\s\S]*?)<\/p>/);
    expect(live).toBe("live from GitHub · 60 s cache · refresh on demand");
  });
});

/**
 * The delivery comparison (#1452) — **on the printed strings**, because the defect it answers was a
 * page that showed one source and let a reader believe there was only one. A row whose declared and
 * derived readings disagree must render *both*, under their own source labels, with the
 * disagreement named; a row nobody filed must render the declared value plus "No linked issue"
 * rather than an empty cell.
 */
describe("the delivery comparison", () => {
  /** The matrix's rendered text, tags collapsed — what a reader actually sees. */
  function text(markup: string): string {
    return markup
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** One row's markup: from its own `data-spec-row` to the next row's. */
  function rowSegment(markup: string, id: string): string {
    const at = markup.indexOf(`data-spec-row="${id}"`);
    if (at < 0) return "";
    const next = markup.indexOf('data-spec-row="', at + 1);
    return markup.slice(at, next < 0 ? undefined : next);
  }

  /** One issue as GitHub serves it, under the marker the row was filed with. */
  function payloadOf(
    number: number,
    rowId: string,
    overrides: { state?: "open" | "closed"; stateReason?: "completed" | "not_planned" } = {},
  ) {
    return {
      number,
      state: overrides.state ?? "open",
      state_reason: overrides.stateReason ?? null,
      body: `<!-- spec-row:${rowId} -->`,
      html_url: `https://github.com/riolabs-ai/alignsynch-web/issues/${number}`,
      milestone: { title: "v2.0.0 — the official release" },
      labels: [{ name: "spec" }, { name: "tier/R1" }],
    };
  }

  /**
   * Two rows carry an issue: APP-02 is `Delivered` and its issue is **open** (the disagreement this
   * card exists to show), APP-05 is `Tentative` and its issue **closed as completed** (the other
   * direction). Every other row has no issue.
   */
  function read(): SpecIssuesReady {
    const issues = specIssuesOf([
      payloadOf(1268, "APP-02"),
      payloadOf(1269, "APP-05", { state: "closed", stateReason: "completed" }),
    ]);
    if (issues === null) throw new Error("the fixture payload did not parse");
    return issues;
  }

  it("renders both readings, under one source label per column, and names the difference", () => {
    const markup = renderToStaticMarkup(
      createElement(ValidationMatrix, { copy, doc: register(), issues: read() }),
    );

    const segment = rowSegment(markup, "APP-02");
    expect(segment).toContain('data-spec-delivery="differs"');
    expect(segment).toContain("Declared by the register");
    expect(segment).toContain("From the linked issue");
    // Both values, in the same block: the register's word and the issue's.
    expect(text(segment)).toContain("Declared by the register Delivered");
    expect(text(segment)).toContain("From the linked issue Open");
    // …and the disagreement, in words.
    expect(text(segment)).toContain("Differs from the register");

    // The other direction is also a disagreement, and it is not silently preferred either.
    const tentative = rowSegment(markup, "APP-05");
    expect(tentative).toContain('data-spec-delivery="differs"');
    expect(text(tentative)).toContain("Declared by the register Tentative");
    expect(text(tentative)).toContain("From the linked issue Delivered");
  });

  it("says a row has no linked issue rather than leaving its cell empty", () => {
    const markup = renderToStaticMarkup(
      createElement(ValidationMatrix, { copy, doc: register(), issues: read() }),
    );
    const segment = rowSegment(markup, "APP-06");
    expect(segment).toContain('data-spec-delivery="none"');
    expect(segment).toContain('data-spec-derived-status="none"');
    const shown = text(segment);
    expect(shown).toContain("Declared by the register Delivered");
    expect(shown).toContain("From the linked issue No linked issue");
    expect(segment).not.toContain('data-spec-delivery="differs"');
  });

  it("counts the four numbers on the page, and lists the rows that differ by name", () => {
    const markup = renderToStaticMarkup(
      createElement(ValidationMatrix, { copy, doc: register(), issues: read() }),
    );
    const summary = markup.match(/data-spec-delivery-summary[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(summary).not.toBe("");
    const shown = text(summary);
    expect(shown).toContain("2 of 88 rows have a reading from a linked issue");
    expect(shown).toContain("0 agree with the register about delivery");
    expect(shown).toContain("2 differ from the register");
    expect(shown).toContain("86 have no linked issue");

    // The list of disagreement, named: the row, its declared status, and what the issue says.
    expect(summary).toContain('data-spec-delivery-differs="APP-02"');
    expect(shown).toContain("APP-02 · declared Delivered · issue says Open");
    expect(shown).toContain("APP-05 · declared Tentative · issue says Delivered");
  });

  it("gives each source its own freshness, and never a date the issue read does not have", () => {
    const doc = register();
    const markup = renderToStaticMarkup(
      createElement(ValidationMatrix, { copy, doc, issues: read() }),
    );
    const summary = markup.match(/data-spec-delivery-summary[\s\S]*?<\/section>/)?.[0] ?? "";

    const declared = text(
      summary.match(/data-spec-delivery-source="register"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "",
    );
    expect(declared).toContain("Declared by the register");
    expect(declared).toContain(specDateLabel(doc.register.generatedAt));
    expect(declared).toContain(`VALIDATION.csv@${doc.register.csvSha256.slice(0, 8)}`);

    const derived = text(
      summary.match(/data-spec-delivery-source="issue"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "",
    );
    expect(derived).toBe(
      "From the linked issue · live from GitHub · 60 s cache · refresh on demand",
    );
  });

  it("draws no comparison at all when GitHub answered nothing", () => {
    const markup = renderToStaticMarkup(
      createElement(ValidationMatrix, {
        copy,
        doc: register(),
        issues: { kind: "unavailable", reason: "failed" },
      }),
    );
    expect(markup).not.toContain("data-spec-delivery-summary");
    expect(markup).not.toContain("Declared by the register");
  });
});
