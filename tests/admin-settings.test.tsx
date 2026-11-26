/**
 * `/admin/settings` (#1443) — the gates, the honest failure state, and the directory behind them.
 *
 * Four claims, and each is one the card's acceptance line names:
 *
 *   1. **The gates run `/admin/health`'s order.** `requireAdminProduct()` is the capability and it
 *      closes before a session is read; then `requireOperator()`; then `requireAdmin({ next })`
 *      through the **real** policy — a member or a `support` seat is refused with Next's own
 *      `notFound()` (never a redirect, never a 403), and a signed-out visitor is sent to
 *      `/login?next=/admin/settings`.
 *   2. **A refused request never reads.** The reader is a spy, so "the page is closed" is a claim
 *      about a call rather than about markup: `support` gets the 404 and `readSettingsDirectory` is
 *      never entered.
 *   3. **An unreadable source is a panel, not a directory of zeroes.** With the reader stubbed to
 *      throw, the page names the reason and draws no provider card — "the ledger could not be read"
 *      and "no rotation is recorded" are different sentences.
 *   4. **The committed sources render every row they carry.** With the **real** reader the page
 *      draws one card per registered provider and one row per manifest row plus every out-of-scope
 *      name, all of them derived rather than typed.
 */
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the mocked role gate answers with — the *policy* underneath it stays real. */
const gate = vi.hoisted(() => ({
  role: "admin" as "support" | "admin" | "owner" | "member" | "signed-out",
}));

/** The capability switch. */
const capability = vi.hoisted(() => ({ adminProduct: true }));

/** How the reader behaves: real files, or a named failure. */
const reader = vi.hoisted(() => ({ mode: "real" as "real" | "unreadable" }));

/** A spy, so "a refused request never reads" is a claim about a call. */
const readSpy = vi.hoisted(() => vi.fn());

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

vi.mock("@/lib/auth/require-role", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/require-role")>();
  const { notFound, redirect } = await import("next/navigation");
  return {
    ...real,
    requireAdmin: async (options: { readonly next?: string } = {}) => {
      const answer = real.roleAnswerFor({
        needed: "admin",
        signedIn: gate.role !== "signed-out",
        role: gate.role === "signed-out" ? null : gate.role,
        ...(options.next === undefined ? {} : { next: options.next }),
      });
      if (answer.kind === "redirect") {
        redirect(answer.to);
        throw new Error("redirect() did not throw");
      }
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

vi.mock("@/lib/admin/settings/read", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/admin/settings/read")>();
  return {
    ...real,
    readSettingsDirectory: (...args: unknown[]) => {
      readSpy();
      if (reader.mode === "unreadable") {
        throw new real.SettingsUnreadable(
          `${real.SETTINGS_ROTATIONS_PATH} is not present in this tree, so this request could not read it`,
        );
      }
      return (real.readSettingsDirectory as (...arguments_: unknown[]) => unknown)(...args);
    },
  };
});

/** Next's `notFound()` / `redirect()` digest, read the way the other console page tests read it. */
async function digestOf(call: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await call();
    return undefined;
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
}

/** The page, as markup, for the mocked role and reader. */
async function render(): Promise<string> {
  const { default: Page } = await import("@/app/(mainlayout)/admin/settings/page");
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup((await Page()) as ReactElement);
}

/** Next 16 answers `notFound()` with this digest; the console's other page tests read it the same. */
const NOT_FOUND = "404";

beforeEach(() => {
  capability.adminProduct = true;
  gate.role = "admin";
  reader.mode = "real";
});

describe("/admin/settings — the gate", () => {
  it("answers a member with the 404 an unknown URL gets", async () => {
    gate.role = "member";
    readSpy.mockClear();
    expect(await digestOf(render)).toContain(NOT_FOUND);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("answers a support seat with the same 404, and never reads", async () => {
    gate.role = "support";
    readSpy.mockClear();
    expect(await digestOf(render)).toContain(NOT_FOUND);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to /login with the destination", async () => {
    gate.role = "signed-out";
    readSpy.mockClear();
    const digest = await digestOf(render);
    expect(digest).toContain("/login");
    expect(digest).toContain(encodeURIComponent("/admin/settings"));
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("closes on the capability before the session is read", async () => {
    capability.adminProduct = false;
    gate.role = "admin";
    readSpy.mockClear();
    expect(await digestOf(render)).toContain(NOT_FOUND);
    expect(readSpy).not.toHaveBeenCalled();
  });
});

describe("/admin/settings — the surface", () => {
  it("draws a panel naming the reason when a source cannot be read", async () => {
    reader.mode = "unreadable";
    gate.role = "admin";
    const html = await render();
    reader.mode = "real";

    expect(html).toContain('data-settings-band="unreadable"');
    expect(html).toContain("data/env/rotations.json");
    // No provider card: a directory of zeroes is the lie this panel exists to avoid.
    expect(html).not.toContain("data-settings-card");
  });

  it("draws one card per registered provider and one row per variable", async () => {
    gate.role = "admin";
    const html = await render();

    const { INTEGRATIONS } = await import("@/data/integrations");
    const { ENV_ROWS, OUT_OF_SCOPE } = await import("@/scripts/env-manifest");

    for (const integration of INTEGRATIONS) {
      expect(html).toContain(`data-settings-card="${integration.id}"`);
    }
    const rows = html.match(/data-settings-variable="/g) ?? [];
    expect(rows).toHaveLength(ENV_ROWS.length + OUT_OF_SCOPE.length);
  });

  it("is read-only: no form, no input, no button, no server action", async () => {
    gate.role = "admin";
    const html = await render();
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<textarea");
  });

  it("prints the census's own date beside the counts it qualifies", async () => {
    gate.role = "admin";
    const html = await render();

    const census = await import("@/lib/admin/settings/read");
    const parsed = census.parseCensus(
      await (await import("node:fs")).promises.readFile(
        new URL(`../${census.SETTINGS_CENSUS_PATH}`, import.meta.url),
        "utf8",
      ),
    );

    expect(parsed.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(html).toContain(`Recorded ${parsed.recordedAt}`);
    expect(parsed.names.length).toBeGreaterThan(0);
    // The findings table is the panel that would have caught incident 1; it is read, not typed.
    expect(parsed.findings.length).toBeGreaterThan(2);
    // The vault half of the `valid` badge: the census's own project-level line, printed as a fact.
    expect(parsed.vaultReadable).not.toBeNull();
    expect(html).toContain('data-settings-vault="read"');
    expect(html).toContain(`${parsed.vaultReadable} vault secret(s) readable`);
  });
});
