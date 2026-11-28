/**
 * `/admin/settings` (#1443) — no value is reachable from the screen, and no client module can reach
 * the reader.
 *
 * Two rules, and the card states both as "must not":
 *
 *   1. **No value, in any form.** Not truncated, not masked, not a length. The proof has three
 *      layers, because a rendered screenshot can only ever show one of them:
 *        - **structural** — the row type the view is handed (`SettingsVariable`) has no field a value
 *          could occupy, and every object carries exactly the documented key set. A value added to
 *          the derivation fails here before it can reach markup;
 *        - **textual** — every string the derivation produces is a *name*: a vault key, a path, a
 *          derivation, a rotation id. None contains `=` (the shape a pasted `NAME=value` line has),
 *          and no string in the rendered tree equals any environment variable's value in this
 *          process;
 *        - **markup** — the rendered page carries no form, input, textarea or button, so there is no
 *          control that could be handed one.
 *   2. **No `"use client"` module reaches `lib/admin/settings/read.ts`.** That module opens files;
 *      E34 walks the real graph and fails a crossing, and this file pins the local half of it — the
 *      surface has no client module at all, and no component in the tree imports the reader.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * The form's action is mocked, and that is not a shortcut.
 *
 * The component imports its server action so the `<form action={…}>` can be rendered; that module
 * reaches `lib/auth/require-role`, whose `@neon/auth` import resolves `next/headers` in a way
 * vitest's resolver rejects inside this workspace layout. What this file asserts is *markup* — which
 * fields exist and which values they carry — so the action is replaced by a no-op and
 * `tests/admin-settings-write.test.ts` proves the write itself against a fake transaction.
 */
vi.mock("@/app/(mainlayout)/admin/settings/actions", () => ({
  updateSettingAction: async () => {},
}));

import { INTEGRATIONS } from "@/data/integrations";
import { adminSettingsPageCopy } from "@/data/pages/admin-settings";
import { buildDirectory, type SettingsDirectory } from "@/lib/admin/settings/providers";
import { ENV_ROWS, OUT_OF_SCOPE } from "@/scripts/env-manifest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Exactly the keys a variable may carry. A new one is a reviewable edit, not a quiet field. */
const VARIABLE_KEYS = [
  "boot",
  "declared",
  "environments",
  "fresh",
  "name",
  "presence",
  "provider",
  "rotation",
  "source",
  "sourceKind",
  "valid",
  "why",
] as const;

/** The derivation with no census and no ledger: every row, every provider, nothing measured. */
const directory: SettingsDirectory = buildDirectory({
  integrations: INTEGRATIONS,
  rows: ENV_ROWS,
  outOfScope: OUT_OF_SCOPE,
  census: null,
  rotations: [],
});

describe("the row shape cannot carry a value", () => {
  it("gives every variable exactly the documented keys", () => {
    for (const card of directory.cards) {
      for (const variable of card.variables) {
        expect(Object.keys(variable).sort()).toEqual([...VARIABLE_KEYS].sort());
      }
    }
  });

  it("prints names and sources, and never a `NAME=value` line", () => {
    for (const card of directory.cards) {
      for (const variable of card.variables) {
        expect(variable.name).not.toContain("=");
        expect(variable.source).not.toContain("=");
      }
    }
  });
});

describe("the rendered tree carries no value", () => {
  /** The real view, rendered from the derivation — the same tree the page draws. */
  async function render(): Promise<string> {
    const { SettingsDirectoryView } = await import(
      "@/components/admin/settings/settings-directory"
    );
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    return renderToStaticMarkup(
      createElement(SettingsDirectoryView, {
        copy: adminSettingsPageCopy,
        directory,
        unreadable: null,
      }) as ReactElement,
    );
  }

  it("renders every row without a form, and without any env value this process holds", async () => {
    const html = await render();

    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<button");

    // Every *credential-shaped* environment value in this process, asserted absent from the
    // markup. A shell holding the demo branch's credentials is the case that matters; CI's empty
    // environment makes this a no-op rather than a false pass. Config values (`BRAND`, a board
    // name) are deliberately excluded — they are words the product is allowed to say.
    const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE|_PASS$)/;
    for (const [name, value] of Object.entries(process.env)) {
      if (value === undefined || value.length < 8 || !SECRET_NAME.test(name)) continue;
      if (html.includes(value))
        throw new Error(`the rendered settings page carries ${name}'s value`);
    }
  });

  it("draws a row per variable, so the absence above is over the whole table", async () => {
    const html = await render();
    const rows = html.match(/data-settings-variable="/g) ?? [];
    expect(rows).toHaveLength(ENV_ROWS.length + OUT_OF_SCOPE.length);
  });
});

/**
 * The governed band (#1443 §11) — the one place a value is rendered, and the reasons it cannot be a
 * secret.
 *
 * The directory's band is proven above: no control at all. This band *does* carry a form, so the
 * claims have to be sharper than "no markup":
 *
 *   - **the fields are exactly the writable governed keys**, by name — a field for a fifth key, or
 *     for a vault-sourced row, fails the set comparison rather than hiding in a screenshot;
 *   - **no credential-shaped environment value appears in the markup**, the same sweep the directory
 *     is held to, run over the band that actually renders values;
 *   - **a refused key draws its reason and no control**, so `NAV_SOURCE` is visible as "cannot be
 *     overridden at runtime" instead of silently absent.
 */
describe("the governed band renders no secret", () => {
  /** The band, rendered from the real registry with this process's environment (or one handed in). */
  async function renderGoverned(
    env: Readonly<Record<string, string | undefined>> | null = null,
    settingsOverrides: Partial<import("@/lib/admin/settings/values").GovernedSettings> = {},
  ): Promise<string> {
    const { GovernedSettingsView } = await import("@/components/admin/settings/governed-settings");
    const { governedSettingsFromEnv } = await import("@/lib/admin/settings/values");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const settings =
      env === null
        ? governedSettingsFromEnv()
        : { ...governedSettingsFromEnv(env), ...settingsOverrides };
    return renderToStaticMarkup(
      createElement(GovernedSettingsView, {
        copy: adminSettingsPageCopy,
        settings,
        unreadable: null,
        status: null,
        action: async () => {},
      }) as ReactElement,
    );
  }

  it("marks a row the environment also carries as shadowed, and shows the env value", async () => {
    // `RESEND_FROM` carried by the deployment and stored in the table: the environment wins, and the
    // row says so before anyone types — an edit that silently lost would be the worst outcome.
    const html = await renderGoverned(
      { RESEND_FROM: "env@example.com" },
      {
        store: "read",
        resolutions: [
          {
            key: "RESEND_FROM",
            value: "env@example.com",
            source: "env",
            shadowedByEnv: true,
            stored: "stored@example.com",
            problem: null,
            writable: true,
          },
        ],
      },
    );
    expect(html).toContain("data-settings-loses-to-env");
    expect(html).toContain("shadowed by env");
    expect(html).toContain('value="env@example.com"');
    expect(html).toContain("Stored: stored@example.com");
  });

  it("draws a field for the four writable keys and for no other name", async () => {
    const { WRITABLE_KEYS } = await import("@/lib/admin/settings/governed");
    const html = await renderGoverned();
    const fields = [...html.matchAll(/<input[^>]*name="value"/g)];
    const rows = [...html.matchAll(/data-settings-key="([A-Z0-9_]+)"/g)].map((match) => match[1]);
    expect(fields.length).toBe(WRITABLE_KEYS.length);
    expect(rows.sort()).toEqual([...WRITABLE_KEYS, "DEMO_ALLOW_PRODUCTION", "NAV_SOURCE"].sort());
  });

  it("carries no credential-shaped environment value into the markup", async () => {
    const html = await renderGoverned();
    const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE|_PASS$)/;
    for (const [name, value] of Object.entries(process.env)) {
      if (value === undefined || value.length < 8 || !SECRET_NAME.test(name)) continue;
      if (html.includes(value)) throw new Error(`the governed band carries ${name}'s value`);
    }
  });

  it("draws a refused key with its reason and no control", async () => {
    const html = await renderGoverned();
    expect(html).toContain("data-settings-fixed-reason");
    expect(html).toContain("NAV_SOURCE");
    expect(html).toContain("inlined into the client bundle");
  });
});

describe("no client module can reach the reader", () => {
  const settingsDir = join(ROOT, "components/admin/settings");

  it("ships no `use client` module in the surface", () => {
    const files = readdirSync(settingsDir).filter((name) => name.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(settingsDir, file), "utf8");
      // The directive, anchored to a line of its own — a docblock that *mentions* `"use client"`
      // is provenance, not a client boundary.
      expect(source, `${file} must stay server-rendered`).not.toMatch(/^\s*["']use client["']/m);
    }
  });

  it("imports the reader from the page module and from no component", () => {
    const page = readFileSync(join(ROOT, "app/(mainlayout)/admin/settings/page.tsx"), "utf8");
    expect(page).toContain("@/lib/admin/settings/read");

    for (const file of readdirSync(settingsDir)) {
      const source = readFileSync(join(settingsDir, file), "utf8");
      expect(source, `${file} must not reach the fs reader`).not.toContain(
        "@/lib/admin/settings/read",
      );
    }
  });
});
