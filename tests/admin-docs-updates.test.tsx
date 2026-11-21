/**
 * `/admin/docs/updates` — the update ledger (the owner ask of 2026-11-21).
 *
 * Four claims:
 *
 *   1. **The same two gates, in the same order, before a file is read** — and a refusal that says
 *      nothing about which entries exist.
 *   2. **The rows are the files.** The real ledger renders its real entry, and a spec the hub
 *      carries becomes an address while one it does not keeps its path with the marker — the rule
 *      this screen exists for, because a silent 404 link is what it replaced.
 *   3. **An empty ledger is a sentence, not a blank page**, and an unreadable one is a panel with
 *      the reason. Neither is drawn as the other.
 *   4. **One address, two spellings.** `lib/docs/updates.ts::updateSpecHref` and
 *      `lib/docs/rows.ts::docHref` are the same URL for the same document, asserted rather than
 *      assumed — the module that builds a spec link cannot reach the `@/` alias (it compiles inside
 *      `data:check`), so the one string it copies is checked here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { parseDocsManifest } from "@/lib/docs/manifest";
import { docHref, docsRows } from "@/lib/docs/rows";
import {
  parseUpdateEntry,
  parseUpdateLedger,
  specDocPath,
  updateRows,
  updateSpecHref,
} from "@/lib/docs/updates";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** What the mocked role gate answers with — the *policy* underneath it stays real. */
const gate = vi.hoisted(() => ({ role: "admin" as "support" | "admin" | "owner" | "member" }));

/** Whether the template claims the console. */
const capability = vi.hoisted(() => ({ adminProduct: true }));

const requireAdminSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/brand-boundary", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/brand-boundary")>();
  const { notFound } = await import("next/navigation");
  return {
    ...real,
    requireAdminProduct: () => {
      if (!capability.adminProduct) notFound();
    },
  };
});

vi.mock("@/lib/auth/session", () => ({
  currentUser: async () => null,
}));

vi.mock("@/lib/db/user-profiles", () => ({
  readUserProfileByUserId: async () => null,
  readUserProfileByHandle: async () => null,
}));

vi.mock("@/lib/auth/require-role", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/require-role")>();
  const { notFound } = await import("next/navigation");
  return {
    ...real,
    requireAdmin: async (options: { next?: string } = {}) => {
      requireAdminSpy(options);
      const answer = real.roleAnswerFor({ needed: "admin", signedIn: true, role: gate.role });
      if (answer.kind === "redirect") throw new Error(`an unexpected redirect to ${answer.to}`);
      if (answer.kind === "not-found") {
        notFound();
        throw new Error("notFound() did not throw");
      }
      return {
        user: { userId: "auth-1", email: "a@b.c", name: "", sessionId: null },
        role: answer.role,
      };
    },
  };
});

/** Comments out, code left: the docstrings name `new Date(` and `node:fs` without importing them. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function sourceOf(relative: string): string {
  return code(readFileSync(`${ROOT}${relative}`, "utf8"));
}

/** Every real entry, as the reader in `lib/docs/tree.ts` hands them over. */
function realFiles() {
  return readdirSync(`${ROOT}docs/changelog/updates`)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      name,
      raw: JSON.parse(readFileSync(`${ROOT}docs/changelog/updates/${name}`, "utf8")) as unknown,
    }));
}

describe("the page — the gates, before anything is read", () => {
  it("closes on the capability before it reads a session", async () => {
    capability.adminProduct = false;
    requireAdminSpy.mockClear();
    const { default: UpdatesPage } = await import("@/app/(mainlayout)/admin/docs/updates/page");

    let digest: string | undefined;
    try {
      await UpdatesPage();
    } catch (error) {
      digest = (error as { digest?: string }).digest;
    }
    expect(digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(requireAdminSpy).not.toHaveBeenCalled();
    capability.adminProduct = true;
  });

  it("answers a member with the same 404 an unknown URL gets", async () => {
    gate.role = "member";
    const { default: UpdatesPage } = await import("@/app/(mainlayout)/admin/docs/updates/page");

    let digest: string | undefined;
    try {
      await UpdatesPage();
    } catch (error) {
      digest = (error as { digest?: string }).digest;
    }
    expect(digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    gate.role = "admin";
  });

  it("sends a signed-out visitor to the ledger's own address", async () => {
    gate.role = "admin";
    requireAdminSpy.mockClear();
    const { default: UpdatesPage } = await import("@/app/(mainlayout)/admin/docs/updates/page");
    await UpdatesPage();
    expect(requireAdminSpy).toHaveBeenCalledWith({ next: "/admin/docs/updates" });
  });
});

describe("the render — the rows are the files", () => {
  it("renders every real entry, with its spec as a hub address", async () => {
    gate.role = "admin";
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: UpdatesPage } = await import("@/app/(mainlayout)/admin/docs/updates/page");

    const html = renderToStaticMarkup((await UpdatesPage()) as ReactElement);
    const rows = updateRows(
      parseUpdateLedger(realFiles()),
      new Set(
        docsRows(parseDocsManifest(JSON.parse(readFileSync(`${ROOT}docs/docs.json`, "utf8")))).map(
          (row) => row.path,
        ),
      ),
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(html, `entry ${row.pr} is missing`).toContain(`data-entry="${row.pr}"`);
      expect(html).toContain(`id="pr-${row.pr}"`);
      for (const spec of row.specLinks) {
        if (spec.href === null) expect(html).toContain(`data-spec-not-in-hub="${spec.path}"`);
        else expect(html).toContain(`data-spec-link="${spec.path}"`);
      }
    }
    // The first entry points at the document that produced the ledger, and the hub carries it.
    expect(html).toContain("Where the rule lives");
  });

  it("marks a spec the hub does not carry instead of linking it", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { UpdatesLedger } = await import("@/components/admin/docs/updates-ledger");
    const { adminDocsUpdatesPageCopy } = await import("@/data/pages/admin-docs");

    const entry = parseUpdateEntry("1400.json", {
      pr: 1400,
      date: "2026-11-21",
      area: "admin",
      summary: "A synthetic entry.",
      reader_impact: "Nobody",
      risk: "none",
      specs: ["docs/specs/not-in-the-hub.md"],
    });

    const html = renderToStaticMarkup(
      <UpdatesLedger
        copy={adminDocsUpdatesPageCopy}
        rows={updateRows([entry], new Set())}
        unreadable={null}
      />,
    );
    expect(html).toContain('data-spec-not-in-hub="docs/specs/not-in-the-hub.md"');
    expect(html).not.toContain(`href="${updateSpecHref("docs/specs/not-in-the-hub.md")}"`);
    expect(html).toContain("not in the hub");
  });

  it("draws the empty sentence when there is no entry, and the panel when the ledger is unreadable", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { UpdatesLedger } = await import("@/components/admin/docs/updates-ledger");
    const { adminDocsUpdatesPageCopy } = await import("@/data/pages/admin-docs");

    const empty = renderToStaticMarkup(
      <UpdatesLedger copy={adminDocsUpdatesPageCopy} rows={[]} unreadable={null} />,
    );
    expect(empty).toContain('data-empty="true"');
    expect(empty).toContain("ledger starts at its first merge");

    const broken = renderToStaticMarkup(
      <UpdatesLedger
        copy={adminDocsUpdatesPageCopy}
        rows={[]}
        unreadable="docs/changelog/updates/1400.json is not valid JSON"
      />,
    );
    expect(broken).toContain('data-unreadable="true"');
    expect(broken).toContain("is not valid JSON");
    expect(broken).not.toContain('data-empty="true"');
  });
});

describe("the releases page's per-release commit list", () => {
  it("joins each merge to the ledger entry its PR wrote", async () => {
    const { parseChangelog } = await import("@/lib/docs/changelog");
    const { parseReleaseRecord } = await import("@/lib/docs/manifest");
    const { releaseRows } = await import("@/lib/docs/releases");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ReleasesShelf } = await import("@/components/admin/docs/releases-shelf");
    const { adminDocsReleasesPageCopy } = await import("@/data/pages/admin-docs");
    const { buildInfo } = await import("@/lib/build-info");

    const entries = parseChangelog(readFileSync(`${ROOT}CHANGELOG.md`, "utf8"));
    const record = parseReleaseRecord(
      JSON.parse(readFileSync(`${ROOT}docs/changelog/releases.json`, "utf8")),
    );
    const updates = updateRows(parseUpdateLedger(realFiles()), new Set());
    const rows = releaseRows(entries, record, updates);

    const joined = rows.flatMap((row) => row.commits).filter((commit) => commit.update !== null);
    expect(joined.length, "no merge in the changelog has a ledger entry").toBeGreaterThan(0);

    const release = rows.find((row) => row.commits.some((commit) => commit.update !== null));
    if (release === undefined) throw new Error("no release carries a joined merge");

    const html = renderToStaticMarkup(
      <ReleasesShelf
        copy={adminDocsReleasesPageCopy}
        rows={rows}
        selected={release}
        unreadable={null}
        build={buildInfo()}
      />,
    );
    expect(html).toContain(`data-commits="${release.commits.length}"`);
    expect(html).toContain("Who notices");
    // The row links to the entry it came from, by the ledger's own anchor.
    const pr = joined[0]?.update?.pr;
    expect(html).toContain(`/admin/docs/updates#pr-${String(pr)}`);
  });
});

describe("the addresses", () => {
  it("builds the same URL as the hub's own docHref", () => {
    for (const path of ["docs/specs/admin-updates.md", "docs/getting-started/demo.md"]) {
      expect(updateSpecHref(path)).toBe(docHref(specDocPath(path)));
    }
  });

  it("reads no clock and opens no filesystem in the render path", () => {
    for (const path of [
      "app/(mainlayout)/admin/docs/updates/page.tsx",
      "components/admin/docs/updates-ledger.tsx",
    ]) {
      const source = sourceOf(path);
      expect(source, `${path} reads a clock`).not.toMatch(/new Date\(|Date\.now\(/);
      expect(source, `${path} opens the filesystem`).not.toMatch(/from "node:fs"/);
    }
    // The pure module *parses* a date (`new Date("2026-11-21T00:00:00Z")`) to refuse `2026-02-31`,
    // which is not a clock read — what it must never do is ask the machine what time it is.
    const updates = sourceOf("lib/docs/updates.ts");
    expect(updates).not.toMatch(/Date\.now\(|new Date\(\s*\)/);
    expect(updates).not.toMatch(/from "node:fs"|from "node:child_process"/);
  });
});
