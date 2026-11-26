---
title: Pick a Template
summary: Start from a relationship like yours, with the questions already written.
audience: [Initiator]
status: "Built (#1170, via #1159 / #1127) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/02-spec-design-page-onboarding-v2/reference/"
  - "issues: #1127"
  - "code: main @ 601ce26"
---
# Pick a Template

You don't have to start from a blank page. Each template is a kind of relationship, Brother–Sister, Partners, Co-Founders and more, with a set of Aspects that people in that relationship usually talk about. Pick the closest one; you can change every Aspect later.

## At a Glance

| | |
|---|---|
| **Where** | **Relationship Templates** (`/relationship-templates`), public, no sign-in needed |
| **What you see** | Categories, template cards, and each template's own page with its Aspects |
| **What it starts** | **Create Relationship** opens Stage 1 with the template's Aspects copied in |
| **From Pricing** | The plan you looked at is carried into setup |

## How It Works

### 1. Browse the catalog

![Relationship Templates catalog with category chips and cards.](../../assets/templates-public/catalog-desktop.png)

*Visitor · Relationship Templates*

<img src="../../assets/templates-public/catalog-mobile.png" alt="Relationship Templates on a phone" width="320" />

*Visitor · Relationship Templates · mobile*

### 2. Open a template to see its Aspects

The template page lists every Aspect with its left (1) and right (5) labels, so you know what you'll be asked.

![A public template page: title, description, the Aspects list and Create Relationship.](../../assets/templates-public/template-page-desktop.png)

*Visitor · public template page*

### 3. Press Create Relationship

Stage 1 opens. If you came from **Pricing**, your plan comes with you.

## Good to Know

- Signed-in members also have **Templates** in the app, with **Library** and **My Templates**. See [My Templates](my-templates.md).

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `content/routes.ts:118` | ""/relationship-templates"" | The public catalog route exists. |
| `data/pages/dashboard-templates.ts:49` | "{ id: "library", label: "Library" }," | In-app Library tab. |
| `data/pages/dashboard-templates.ts:63` | "{ id: "create", label: "Create Relationship" }," | Cards start the wizard. |
| `data/pages/dashboard-templates.ts:125` | "{ id: "price", label: "{plan} · {price}/mo" }," | Library cards print a plan and price; after PR #1241 that must read Basic · $9.99/mo. |

**Open deltas:** template-card price line must follow the one-plan catalogue ([PR #1241](https://github.com/riolabs-ai/alignsynch/pull/1241)).

## References

| Shot | Source | Original |
|---|---|---|
| catalog-desktop | **Bundle** 02 (cropped to the top 1400 px) | `spec-design-v2-bundles/02-spec-design-page-onboarding-v2/reference/relationship-templates-1280.png` |
| catalog-mobile | **Bundle** 02 (cropped to the top 2000 px) | `spec-design-v2-bundles/02-spec-design-page-onboarding-v2/reference/relationship-templates-390.png` |
| template-page-desktop | **Bundle** 02 | `spec-design-v2-bundles/02-spec-design-page-onboarding-v2/reference/relationship-template-public-1280.png` |

Bundle 02 catalog renders are tall full-page shots, cropped as noted.
