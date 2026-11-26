---
title: Stage 3 · Aspects
summary: "Make the questions your own: edit, reorder, add or remove."
audience: [Initiator, Build team]
status: Built (#1144) · design deltas open
sources:
  - "bundle: spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/"
  - "code: main @ 601ce26"
---
# Stage 3 · Aspects

Make the questions your own: edit, reorder, add or remove.

## At a Glance

| | |
|---|---|
| **Who acts** | Initiator |
| **The Initiator sees** | The Aspect list, the drawer, **Add an Aspect** |
| **The Counterparty sees** | A preview of the Aspects on the invite |
| **What moves it forward** | **Continue to Stage 4** (at least one Aspect) |

![Stage 3 Aspects](../../assets/wizard/stage-3-aspects-desktop.png)

*Stage 3*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/assessment-create.ts:647` | "{ id: "add", label: "Add an Aspect" }," | Add. |
| `data/pages/assessment-create.ts:627` | "{ id: "save", label: "Save Aspect" }," | Drawer save. |
| `data/pages/invite.ts:89` | "{ id: "aspects-badge", label: "Preview" }," | Counterparty preview. |

## References

| Shot | Source | Original |
|---|---|---|
| stage-3-aspects-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-stage3-1280.png` |
