---
title: Stage 1 · Details
summary: The relationship gets a name, both people, and the invite address.
audience: [Initiator, Build team]
status: Built (#1144) · design deltas open
sources:
  - "bundle: spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/"
  - "code: main @ 601ce26"
---
# Stage 1 · Details

The relationship gets a name, both people, and the invite address.

## At a Glance

| | |
|---|---|
| **Who acts** | Initiator |
| **The Initiator sees** | Title, both first names (Counterparty last name optional), invite email, optional description |
| **The Counterparty sees** | Nothing yet |
| **What moves it forward** | **Continue to Stage 2** |

![Stage 1 Details](../../assets/wizard/stage-1-details-desktop.png)

*Stage 1*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/assessment-create.ts:532` | "{ id: "title-label", label: "Your Personalized Relationship Title" }," | Title field. |
| `data/pages/assessment-create.ts:546` | "{ id: "email-label", label: "Counterparty Email for Invite" }," | Invite address. |
| `data/pages/assessment-create.ts:553` | "{ id: "description-help", label: "Optional. Shown to both parties, never scored." }," | Description. |

## References

| Shot | Source | Original |
|---|---|---|
| stage-1-details-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-1280.png` |
