---
title: Results and Align
summary: See where you match, where you're close, and what to talk about first.
audience: [Initiator, Counterparty]
status: "Built (#1145, #1148) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/04-spec-design-page-align-v2/reference/"
  - "bundle: spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-waiting-*"
  - "issues: #1122, #1124"
  - "code: main @ 601ce26"
---
# Results and Align

When you've both answered, Align puts your answers side by side, one row per Aspect, with a status for each. It also picks a **Next Step**: the widest Gap, the one conversation most worth having first.

## At a Glance

| Status | Meaning |
|---|---|
| ✓ **In Synch** | You answered the same |
| ≈ **Small Gap** | One step apart. Counts as aligned under **Soft** |
| ⚑ **Gap** | Two or more steps apart |

| Before Align | You see |
|---|---|
| You've answered, they haven't | **Waiting on {name}** |
| They've answered, you haven't | **Continue Your Assessment** |

## How It Works

### 1. Waiting on the other person

![Relationship page while waiting: Waiting on Elena.](../../assets/align/waiting-desktop.png)

*Marcus (Initiator) · waiting*

![Elena's page while waiting on Marcus.](../../assets/align/waiting-counterparty-desktop.png)

*Elena (Counterparty) · waiting*

### 2. Results are in

![Align with each Aspect's answers and status.](../../assets/get-started/align-desktop.png)

*Align · desktop*

<img src="../../assets/get-started/align-mobile.png" alt="Align on a phone" width="320" />

*Align · mobile*

### 3. Open the Next Step

Tag the Aspect in the Discussion and talk it through.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/chat.ts:54` | "{ id: "chip-small", label: "Small Gap" }," | Status words. |
| `data/pages/chat.ts:55` | "{ id: "chip-not-ok", label: "Small Gap · Not OK Under Full" }," | Small Gap under Full. |
| `data/pages/dashboard-relationship-detail.ts:82` | "{ id: "waiting", label: "Waiting on {name}" }," | Waiting line. |
| `data/pages/start.ts:52` | "{ id: "open-align", label: "Open Align" }," | Start links to Align. |
| `data/pages/assessment-relationship-report.ts:88` | "heading: "Where you stand"," | The report verdict section; Title Case needed. |

**Open deltas:** report headings in sentence case ("Where you stand", "The report").

## References

| Shot | Source | Original |
|---|---|---|
| waiting-desktop | **Bundle** 03 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| waiting-counterparty-desktop | **Bundle** 03 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| align-desktop | **Bundle** 04 (cropped to the top 1800 px) | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| align-mobile | **Bundle** 04 (cropped to the top 2200 px) | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
