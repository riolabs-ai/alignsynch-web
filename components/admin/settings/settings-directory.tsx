// template-ancestor: components/admin/permissions/permissions-console.tsx   (variation: a directory of accounts instead of a registry of rules — the cards are providers, each carrying the variables it owns, and the two panels under them are the census and the rotation ledger rather than one markdown source's counts)
//
// `/admin/settings` — the integration directory (#1443).
//
// **What the screen is.** Four bands, in the order an operator asks: the accounts and their
// variables; what the badges mean; the two panels that qualify every count (the store census and its
// date, the rotation ledger and its dates); and where a change happens. Nothing here is a control —
// the only two links leave the app for the provider's own console and docs, drawn by `LeavingLink`
// with its new-tab contract.
//
// **Read-only is structural.** No form, no input, no button, no server action, no `"use client"`:
// this file imports nothing that can mutate, and `tests/admin-settings-no-secret.test.ts` asserts the
// import graph stays that way — the same rule `/admin/health` states in its docstring.
//
// **Three sentences that never merge.** A badged `not checked` (no probe exists), the panel
// `not measured in this deployment` (the census was not readable here) and `0 findings` (it was read
// and reported none) are drawn from three different ids, because a screen that prints any of them
// for another is lying about what it measured.
//
// Every word is `data/pages/admin-settings.ts` (E23 budget 0).

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PageCopy } from "@/content/pages";
import type { SettingsDirectory, SourceKind } from "@/lib/admin/settings/providers";
import { fillLabel, itemLabel, sectionBody, sectionOf } from "@/lib/page-copy";

import { IntegrationCard } from "./integration-card";

/** The source kinds, in the order the "where a change happens" band lists them. */
const CHANGE_ORDER: readonly SourceKind[] = [
  "vault",
  "literal",
  "derived",
  "carried",
  "default",
  "mixed",
];

export interface SettingsDirectoryProps {
  copy: PageCopy;
  /** The derived directory, or `null` when a source could not be read. */
  directory: SettingsDirectory | null;
  /** Why the sources could not be read, or `null`. */
  unreadable: string | null;
}

export function SettingsDirectoryView({ copy, directory, unreadable }: SettingsDirectoryProps) {
  const integrations = sectionOf(copy, "integrations");
  const census = sectionOf(copy, "census");
  const ledger = sectionOf(copy, "ledger");
  const change = sectionOf(copy, "change");

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">{copy.heading}</h1>
        {copy.subtitle === undefined ? null : (
          <p className="max-w-3xl text-sm text-gray-600">{copy.subtitle}</p>
        )}
        <p
          data-settings-values-note=""
          className="max-w-3xl rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"
        >
          {itemLabel(integrations, "values-note")}
        </p>
      </header>

      {unreadable === null && directory !== null ? (
        <>
          <section data-settings-band="integrations" className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-gray-900">{integrations.heading}</h2>
              <p className="max-w-3xl text-sm text-gray-600">{sectionBody(integrations)}</p>
              <p className="text-xs text-gray-600">
                {fillLabel(itemLabel(integrations, "provider-total"), {
                  providers: directory.totals.providers,
                })}
                {" · "}
                {fillLabel(itemLabel(integrations, "variable-total"), {
                  variables: directory.totals.variables,
                  declared: directory.totals.declared,
                  outOfScope: directory.totals.outOfScope,
                })}
              </p>
            </div>
            <div className="grid gap-4">
              {directory.cards.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
                  {itemLabel(integrations, "no-cards")}
                </div>
              ) : (
                directory.cards.map((card) => (
                  <IntegrationCard key={card.integration.id} copy={copy} card={card} />
                ))
              )}
            </div>
          </section>

          <section data-settings-band="census" className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">{census.heading}</h2>
            <p className="max-w-3xl text-sm text-gray-600">{sectionBody(census)}</p>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{itemLabel(census, "census-path")}</CardTitle>
                <CardDescription>
                  {directory.recordedAt === null
                    ? itemLabel(census, "unmeasured")
                    : fillLabel(itemLabel(census, "recorded"), {
                        at: directory.recordedAt,
                        names: directory.names ?? 0,
                        stores: directory.stores ?? 0,
                      })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p
                  data-settings-vault={directory.vaultReadable === null ? "unmeasured" : "read"}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"
                >
                  {directory.vaultReadable === null
                    ? itemLabel(census, "vault-unmeasured")
                    : fillLabel(itemLabel(census, "vault-read"), {
                        secrets: directory.vaultReadable,
                      })}
                </p>
                {directory.findings.length === 0 ? (
                  <p className="text-sm text-gray-600">{itemLabel(census, "finding-none")}</p>
                ) : (
                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    {directory.findings.map((finding) => (
                      <div key={finding.finding} className="flex justify-between gap-2">
                        <dt className="text-gray-600">
                          {fillLabel(itemLabel(census, "finding-row"), {
                            finding: finding.finding,
                          })}
                        </dt>
                        <dd className="font-medium text-gray-900">
                          {fillLabel(itemLabel(census, "finding-count"), { count: finding.count })}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-gray-900">
                    {itemLabel(census, "undeclared-heading")}
                  </h3>
                  {directory.undeclared.length === 0 ? (
                    <p className="text-xs text-gray-600">{itemLabel(census, "undeclared-empty")}</p>
                  ) : (
                    <p className="font-mono text-xs text-gray-900">
                      {directory.undeclared.join(" · ")}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          <section data-settings-band="change" className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">{change.heading}</h2>
            <p className="max-w-3xl text-sm text-gray-600">{sectionBody(change)}</p>
            <ul className="grid gap-1 text-xs text-gray-700 sm:grid-cols-2">
              {CHANGE_ORDER.map((kind) => (
                <li key={kind} data-settings-change={kind}>
                  {itemLabel(change, kind)}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <section data-settings-band="unreadable" className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">
            {sectionOf(copy, "unreadable").heading}
          </h2>
          <p className="max-w-3xl text-sm text-gray-600">
            {sectionBody(sectionOf(copy, "unreadable"))}
          </p>
          <p
            data-settings-unreadable-reason=""
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {fillLabel(itemLabel(sectionOf(copy, "unreadable"), "reason-label"), {
              reason: unreadable ?? "",
            })}
          </p>
        </section>
      )}

      <section data-settings-band="ledger" className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">{ledger.heading}</h2>
        <p className="max-w-3xl text-sm text-gray-600">{sectionBody(ledger)}</p>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{itemLabel(ledger, "ledger-path")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-gray-700">
            {directory === null || directory.ledger.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-xs text-gray-600">
                {itemLabel(ledger, "ledger-none")}
              </div>
            ) : (
              directory.ledger.map((set) => (
                <div key={set.id} data-settings-rotation={set.id} className="space-y-1">
                  <p className="font-medium text-gray-900">
                    {fillLabel(itemLabel(ledger, "changed"), { at: set.changedAt })}
                  </p>
                  <p className="font-mono text-gray-600">{set.why}</p>
                  <p>
                    {set.governed === 0
                      ? itemLabel(ledger, "governs-none")
                      : fillLabel(itemLabel(ledger, "governs"), { variables: set.governed })}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
