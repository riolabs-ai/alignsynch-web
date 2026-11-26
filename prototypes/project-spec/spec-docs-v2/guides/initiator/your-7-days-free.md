---
title: Your 7 Days Free
summary: Try a whole relationship free for a week, starting when they accept.
audience: [Initiator]
status: "Built (#1116, #1117, #1156 via #1170) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-live-payment-*"
  - "bundle: spec-design-v2-bundles/08-spec-design-page-payment-v2/reference/"
  - "issues: #1115, #1132"
  - "code: main @ 601ce26"
---
# Your 7 Days Free

You get a full week with the relationship running before you decide. No card to start. The days only count once the other person accepts, so a draft or a waiting invite costs you nothing.

## At a Glance

| Moment | What you see |
|---|---|
| **Before they accept** | ✓ Trial Starts When Elena Accepts |
| **Running** | ✓ Free Trial · 3 Days Left, and "Add a card before Nov 19 to keep Stage 6 running." |
| **Ending** | The countdown shows from 2 days left |
| **Ended, no card** | Stage 6 pauses; see [When a Relationship Pauses](when-a-relationship-pauses.md) |

## How It Works

### 1. Before they accept

Payment shows **Trial Starts When {name} Accepts** and **Card: Not needed**.

### 2. While it runs

![Relationship Detail, Payment tab while the trial runs: days left, the end date and Add a Card.](../../assets/trial/trial-running-payment-desktop.png)

*Initiator · trial running · Payment tab*

<img src="../../assets/trial/trial-running-payment-mobile.png" alt="Payment tab on a phone" width="320" />

*mobile*

### 3. Add a card any time

**Add a Card** keeps Stage 6 running after the week. Nothing is charged before the trial ends.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `lib/billing/trial.ts:32` | "export const TRIAL_DAYS = 7;" | Seven days. |
| `lib/billing/trial.ts:41` | "export const TRIAL_ENDING_DAYS = 2;" | Ending from two days left. |
| `lib/flow/store.ts:1153` | "await grantAcceptanceTrial(sqlOf(client), {" | Written at acceptance. |
| `data/pages/payment.ts:66` | "{ id: "badge-accept", label: "Trial Starts When {name} Accepts" }," | Pre-accept badge. |
| `data/pages/payment.ts:77` | "{ id: "note-trial", label: "Add a card before {date} to keep Stage 6 running." }," | Running note. |
| `lib/relationship/trial.ts:36` | "export const TRIAL_DAYS = 14;" | A second constant: 14 = the 7-day trial plus the 7-day Extra Week. |

**Open deltas:** main grants one trial per account (`lib/db/billing.ts`), while Payment says "7 days free per relationship". Decide which is true and align both.

## References

| Shot | Source | Original |
|---|---|---|
| trial-running-payment-desktop | **Bundle** 03 | `spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-live-payment-1280.png` |
| trial-running-payment-mobile | **Bundle** 03 (cropped to the top 2200 px) | `spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-live-payment-390.png` |
