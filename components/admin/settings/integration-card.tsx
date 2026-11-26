// template-ancestor: components/admin/permissions/permissions-console.tsx   (variation: one card per account instead of one table, and the badges beside each variable are derived from three committed sources rather than parsed from one markdown file)
//
// One provider's card on `/admin/settings` (#1443).
//
// **The card is the matrix.** The spec's band 2 asks for the same rows as a table with an
// environment column each; a second table of the same variables is the one thing the card forbids
// ("no second table of variables"), so the matrix is folded into the card: one row per variable, one
// column per deployment, and the source and the two derived badges beside them. What the reader
// gets is the same eight facts, drawn once.
//
// **No value is reachable from here.** The card is handed a `SettingsCard` that carries names,
// sources, dates and states; the type has no field a secret could occupy, which is what makes "the
// screen cannot print a value" a property of the shape rather than of the markup.
//
// **Read-only is structural.** No form, no input, no button, no server action and no `"use client"`:
// the two controls are `LeavingLink`s that leave the app for the provider's own console and docs.
//
// Every word is `data/pages/admin-settings.ts` (E23 budget 0) — the badges, the column names and the
// empty state included.

import { LeavingLink } from "@/components/layout/leaving-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PageCopy } from "@/content/pages";
import type {
  Presence,
  SettingsCard,
  SettingsVariable,
  SourceKind,
  Validity,
} from "@/lib/admin/settings/providers";
import { SETTINGS_ENVIRONMENTS } from "@/lib/admin/settings/providers";
import { fillLabel, itemLabel, sectionOf } from "@/lib/page-copy";

/** The badge tones, as this tree's design tokens: green for a fact that holds, amber for one that
 *  does not, grey for one nobody measured. Never colour alone — every chip carries its word. */
const TONE = {
  good: "border-green-200 bg-green-50 text-green-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  idle: "border-gray-200 bg-gray-50 text-gray-700",
  bad: "border-red-200 bg-red-50 text-red-800",
} as const;

/**
 * The two tones this card names in more than one place. Module constants rather than a bare string
 * on each `<Chip>`: a JSX attribute's string value is a *copy* literal to E23, and a tone is not
 * copy — it is a token lookup. The words are the fixture's; the colour is this file's.
 */
const WARN: keyof typeof TONE = "warn";
const IDLE: keyof typeof TONE = "idle";

/** One badge: the fixture's word for a state, and the tone that state deserves. */
function Chip({ label, tone }: { label: string; tone: keyof typeof TONE }) {
  return (
    <Badge variant="outline" className={TONE[tone]}>
      {label}
    </Badge>
  );
}

/** The words for one presence state, from the `variable` band of the fixture. */
function presenceWord(
  copy: PageCopy,
  presence: Presence,
): { word: string; tone: keyof typeof TONE } {
  const section = sectionOf(copy, "variable");
  switch (presence) {
    case "present":
      return { word: itemLabel(section, "present"), tone: "good" };
    case "empty":
      return { word: itemLabel(section, "empty"), tone: "warn" };
    case "absent":
      return { word: itemLabel(section, "absent"), tone: "bad" };
    default:
      return { word: itemLabel(section, "unknown"), tone: "idle" };
  }
}

/** The freshness badge: `current`, `stale`, or the honest `not measured`. */
function freshnessWord(
  copy: PageCopy,
  variable: SettingsVariable,
): { word: string; tone: keyof typeof TONE } {
  const section = sectionOf(copy, "variable");
  if (variable.fresh === "current")
    return { word: itemLabel(section, "fresh-current"), tone: "good" };
  if (variable.fresh === "stale") return { word: itemLabel(section, "fresh-stale"), tone: "warn" };
  return { word: itemLabel(section, "not-measured"), tone: "idle" };
}

/** The vault badge: what the census's walk answered about this name, and never `ok`. */
function validityWord(
  copy: PageCopy,
  validity: Validity,
): { label: string; tone: keyof typeof TONE } {
  const section = sectionOf(copy, "variable");
  switch (validity) {
    case "readable":
      return { label: itemLabel(section, "vault-readable"), tone: "good" };
    case "empty":
      return { label: itemLabel(section, "vault-empty"), tone: "warn" };
    case "unreachable":
      return { label: itemLabel(section, "vault-unreachable"), tone: "bad" };
    case "absent":
      return { label: itemLabel(section, "vault-absent"), tone: IDLE };
    default:
      return { label: itemLabel(section, "not-measured"), tone: IDLE };
  }
}

/** The source cell's tone: a vault-held secret and a literal are both facts, not problems. */
function sourceTone(kind: SourceKind): keyof typeof TONE {
  if (kind === "mixed") return "warn";
  if (kind === "default") return "idle";
  return "idle";
}

/** One variable row: the name and its note, then source, the three deployments, freshness, validity. */
function VariableRow({ copy, variable }: { copy: PageCopy; variable: SettingsVariable }) {
  const variableBand = sectionOf(copy, "variable");
  const requirementWords = {
    required: itemLabel(variableBand, "required"),
    optional: itemLabel(variableBand, "optional"),
    forbidden: itemLabel(variableBand, "forbidden"),
  } as const;
  const environmentWords = {
    local: itemLabel(variableBand, "local"),
    preview: itemLabel(variableBand, "preview"),
    production: itemLabel(variableBand, "production"),
  } as const;
  const fresh = freshnessWord(copy, variable);

  return (
    <TableRow data-settings-variable={variable.name}>
      <TableCell className="align-top">
        <span className="block font-mono text-xs text-gray-900">{variable.name}</span>
        <span className="mt-1 block text-xs text-gray-600">{variable.why}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          <Chip
            label={
              variable.declared
                ? itemLabel(variableBand, "declared")
                : itemLabel(variableBand, "not-declared")
            }
            tone={variable.declared ? "good" : "idle"}
          />
          {variable.boot ? (
            <Chip label={itemLabel(sectionOf(copy, "integrations"), "boot-label")} tone={WARN} />
          ) : null}
        </span>
      </TableCell>
      <TableCell className="align-top">
        <Chip label={variable.source} tone={sourceTone(variable.sourceKind)} />
      </TableCell>
      {SETTINGS_ENVIRONMENTS.map((environment) => {
        const requirement = variable.environments[environment];
        const cells =
          requirement === "forbidden"
            ? { word: requirementWords.forbidden, tone: "bad" as const }
            : presenceWord(copy, variable.presence[environment]);
        return (
          <TableCell key={environment} className="align-top" title={environmentWords[environment]}>
            <Chip label={cells.word} tone={cells.tone} />
          </TableCell>
        );
      })}
      <TableCell className="align-top">
        <Chip label={fresh.word} tone={fresh.tone} />
      </TableCell>
      <TableCell className="align-top">
        <Chip {...validityWord(copy, variable.valid)} />
      </TableCell>
    </TableRow>
  );
}

export function IntegrationCard({ copy, card }: { copy: PageCopy; card: SettingsCard }) {
  const integrations = sectionOf(copy, "integrations");
  const variables = sectionOf(copy, "variable");
  const { integration, counts } = card;

  return (
    <Card data-settings-card={integration.id}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span>{integration.label}</span>
          <Chip label={integration.actor} tone={IDLE} />
          <Chip label={integration.tool} tone={IDLE} />
        </CardTitle>
        <CardDescription>{integration.holds}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-gray-600">
          {fillLabel(itemLabel(integrations, "card-counts"), {
            variables: counts.variables,
            present: counts.present,
            readable: counts.readable,
            stale: counts.stale,
          })}
        </p>

        <dl className="grid gap-2 text-xs sm:grid-cols-3">
          {SETTINGS_ENVIRONMENTS.map((environment) => (
            <div key={environment} data-settings-account={environment}>
              <dt className="text-gray-500">
                {itemLabel(sectionOf(copy, "variable"), environment)}
              </dt>
              <dd className="text-gray-900">{integration.account[environment]}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-4 text-xs">
          <LeavingLink
            href={integration.console}
            label={itemLabel(integrations, "console-label")}
            className="text-action hover:underline"
          />
          <LeavingLink
            href={integration.docs}
            label={itemLabel(integrations, "docs-label")}
            className="text-action hover:underline"
          />
        </div>

        {card.variables.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-xs text-gray-600">
            {itemLabel(integrations, "empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{itemLabel(variables, "column-name")}</TableHead>
                  <TableHead>{itemLabel(variables, "column-source")}</TableHead>
                  {SETTINGS_ENVIRONMENTS.map((environment) => (
                    <TableHead key={environment}>
                      {itemLabel(sectionOf(copy, "variable"), environment)}
                    </TableHead>
                  ))}
                  <TableHead>{itemLabel(variables, "column-fresh")}</TableHead>
                  <TableHead>{itemLabel(variables, "column-valid")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {card.variables.map((variable) => (
                  <VariableRow key={variable.name} copy={copy} variable={variable} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
