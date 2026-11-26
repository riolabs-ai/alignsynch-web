---
title: Add a Card or Take Your Extra Week
summary: Two ways to resume a paused Stage 6, each in one step.
audience: [Initiator]
status: "Built (#1143, #1156 via #1170) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/"
  - "issues: #1121, #1132"
  - "code: main @ 601ce26"
---
# Add a Card or Take Your Extra Week

When your trial ends without a card, Stage 6 pauses and you choose how to resume. **Add a Card** resumes it for good at $9.99 / month. **Get 7 More Days Free** gives you one more week, once per relationship. Either way Stage 6 resumes right away and nothing is lost.

## At a Glance

| Choice | Result | Available |
|---|---|---|
| **Add a Card** | Stage 6 resumes; Basic continues at $9.99 / month | Always |
| **Get 7 More Days Free** | Stage 6 resumes for one Extra Week | Once per relationship |

## How It Works

### 1. From the paused Payment tab

![Payment tab while paused: 1 Free Week Available, Add a Card, Get 7 More Days Free.](../../assets/relationship-pause/trial-ended-initiator-payment-desktop.png)

*Initiator · Trial Ended · Payment tab*

### 2. After taking the Extra Week

A confirmation reads **7 More Days Added · Stage 6 is running again**, and the badge becomes **Extra Week · {days} Days Left**.

![Relationship Detail running on the Extra Week, with Extra Week days left.](../../assets/trial/extra-week-running-desktop.png)

*Initiator · Extra Week running*

### 3. If the Extra Week ends too

Only **Add a Card** remains.

![Payment tab after the Extra Week: Add a Card only.](../../assets/trial/extra-week-ended-payment-desktop.png)

*Initiator · Extra Week Ended · Payment tab*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/dashboard-relationship-detail.ts:256` | "{ id: "extend", label: "Get 7 More Days Free" }," | Extra Week action. |
| `data/pages/dashboard-relationship-detail.ts:262` | "label: "7 More Days Added · Stage 6 is running again. Your extra week ends {instant}."," | Confirmation; "extra week" should be **Extra Week**. |
| `lib/relationship/pause.ts:46` | "export const EXTENSION_DAYS = 7;" | One 7-day Extra Week. |
| `lib/member/trial-extension.ts:88` | "export async function claimTrialExtension(" | The claim writer. |
| `data/pages/payment.ts:74` | "{ id: "extra-week-available", label: "1 Free Week Available" }," | Payment row. |

**Open deltas:** Title Case "Extra Week" inside the confirmation sentence.

## References

| Shot | Source | Original |
|---|---|---|
| trial-ended-initiator-payment-desktop | **Bundle** 03 | `spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-trial-ended-initiator-payment-1280.png` |
| extra-week-running-desktop | **Bundle** 03 | `spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-extended-live-1280.png` |
| extra-week-ended-payment-desktop | **Bundle** 03 | `spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-trial-ended-extended-initiator-payment-1280.png` |
