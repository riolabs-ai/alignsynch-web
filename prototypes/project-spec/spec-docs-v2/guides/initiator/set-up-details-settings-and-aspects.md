---
title: Set Up Details, Settings and Aspects
summary: Name the relationship, choose how you'll compare, and make the Aspects your own, in three short stages.
audience: [Initiator]
status: "Built (#1144, drawer via #1170 / #1133) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/"
  - "issues: #1123, #1133"
  - "code: main @ 601ce26"
---
# Set Up Details, Settings and Aspects

The first three stages are about the relationship itself. They take a couple of minutes, everything can change later, and nothing is sent until Stage 5.

## At a Glance

| Stage | You choose | Button |
|---|---|---|
| **1 · Details** | Title, both first names, their email, an optional description | **Continue to Stage 2** |
| **2 · Settings** | **Opinions Mode** (Basic or Advanced) and **Alignment Setting** (Soft or Full) | **Continue to Stage 3** |
| **3 · Aspects** | Edit, reorder, add or remove Aspects (at least one) | **Continue to Stage 4** |

The left rail shows every stage with an icon and a word: **Done**, **In Progress**, **Up Next**, **Later**. Stage 6 reads **Starts when they join**.

## How It Works

### 1. Stage 1 · Details

![Stage 1 Details with title, names, email and description.](../../assets/wizard/stage-1-details-desktop.png)

*Initiator · Stage 1 Details*

<img src="../../assets/wizard/stage-1-details-mobile.png" alt="Stage 1 on a phone" width="320" />

*Initiator · Stage 1 · mobile*

### 2. Stage 2 · Settings

**Basic** asks two opinions per Aspect (how you feel, how you wish it were). **Advanced** asks four. **Soft** counts answers one step apart as aligned; **Full** counts only identical answers. Mode is fixed once the relationship is created.

![Stage 2 Settings: Opinions Mode and Alignment Setting.](../../assets/wizard/stage-2-settings-desktop.png)

*Initiator · Stage 2 Settings*

### 3. Stage 3 · Aspects

Tap an Aspect to edit it in the drawer: the question, the left label (what a 1 means) and the right label (what a 5 means). Drag to reorder. **Add an Aspect** adds one; a relationship needs at least one.

![Stage 3 Aspects list with drag handles and Add an Aspect.](../../assets/wizard/stage-3-aspects-desktop.png)

*Initiator · Stage 3 Aspects*

![The Aspect drawer: the question, left and right labels, Save Aspect and Cancel.](../../assets/wizard/aspect-drawer-desktop.png)

*Initiator · Aspect drawer*

## Good to Know

- **Save and Exit** keeps a draft. Drafts use no trial days and nothing is sent.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/assessment-create.ts:113` | "heading: "Relationship Details"," | Stage 1 heading. |
| `data/pages/assessment-create.ts:559` | "{ id: "submit", label: "Continue to Stage 2" }," | Stage 1 action. |
| `data/pages/assessment-create.ts:580` | "heading: "Relationship Settings"," | Stage 2 heading. |
| `data/pages/assessment-create.ts:584` | "{ id: "mode-fixed", label: "Fixed at creation" }," | Mode is fixed at creation. |
| `data/pages/assessment-create.ts:615` | "heading: "Relationship Aspects"," | Stage 3 heading. |
| `data/pages/assessment-create.ts:620` | "{ id: "drag-hint", label: "Drag to Reorder Aspects" }," | Reorder hint. |
| `data/pages/assessment-create.ts:651` | "label: "A relationship asks at least one Aspect. Add another before removing this one."," | At least one Aspect. |
| `data/pages/assessment-create.ts:488` | "{ id: "status-up-next", label: "Up Next" }," | Rail status words. |
| `data/pages/assessment-create.ts:622` | "{ id: "left-label", label: "Left opinion label" }," | Drawer labels are sentence case; spec is Title Case. |

**Open deltas:** Title Case on drawer labels ("Left opinion label", "Right opinion label", "The question both seats answer").

## References

| Shot | Source | Original |
|---|---|---|
| stage-1-details-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-1280.png` |
| stage-1-details-mobile | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-390.png` |
| stage-2-settings-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-stage2-1280.png` |
| stage-3-aspects-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-stage3-1280.png` |
| aspect-drawer-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/drawer-edit-1280.png` |
