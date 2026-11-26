---
title: Stage 6 · Align
summary: "Live when the Counterparty accepts: both answer, then see Align and talk it through."
audience: [Initiator, Counterparty, Build team]
status: "Built (#1144, #1147, #1148) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/"
  - "code: main @ 601ce26"
---
# Stage 6 · Align

Live when the Counterparty accepts: both answer, then see Align and talk it through.

## At a Glance

| | |
|---|---|
| **Who acts** | Both |
| **The Initiator sees** | Next Step, Discussion, Aspects, Members, Details, Settings, Payment tabs |
| **The Counterparty sees** | The same, with no price, trial or card anywhere |
| **What moves it forward** | Acceptance makes it live; a trial end with no card pauses it; leaving closes it |

![Relationship Detail with Stage 6 live: the stage gauge, Next Step and Discussion.](../../assets/stage-6/relationship-live-desktop.png)

*Marcus (Initiator) · Stage 6 Live*

See [Results and Align](../../guides/shared/results-and-align.md) and [When a Relationship Pauses](../../guides/initiator/when-a-relationship-pauses.md).

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/invite.ts:148` | "When you accept, Stage 6 goes live for both of you and your first Assessment opens." | Goes live on accept. |
| `data/pages/dashboard-relationship-detail.ts:233` | "heading: "Stage 6 is paused"," | Paused state. |
| `data/pages/dashboard-relationship-detail.ts:888` | "{ id: "discussion", label: "Discussion" }," | Tabs. |

## References

| Shot | Source | Original |
|---|---|---|
| relationship-live-desktop | **Bundle** 03 | `spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-live-1280.png` |
