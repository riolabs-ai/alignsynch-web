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
import { describe, expect, it } from "vitest";

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
