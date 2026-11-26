---
title: Plans and the Free Trial
summary: One plan, Basic at $9.99 a month for one relationship, after 7 days free that start when they accept.
audience: [Visitor, Initiator]
status: "Planned (Basic only: https://github.com/riolabs-ai/alignsynch/pull/1241) · trial Built (#1116, #1117, #1143)"
sources:
  - "bundle: spec-design-v2-bundles/08-spec-design-page-payment-v2/reference/"
  - "bundle: spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/"
  - "decisions: PR #1237 (Family removed) · PR #1241 (Single Annual removed, Basic only)"
  - "code: main @ 601ce26"
---
# Plans and the Free Trial

You only pay when it's working for you. Every relationship starts with **7 days free**, no card needed, and the clock doesn't start until the other person accepts your invite. After that, it's **Basic: $9.99 a month** for that relationship. The person you invite never pays.

## At a Glance

| | |
|---|---|
| **Plan** | **Basic** · $9.99 / month · one relationship |
| **Free trial** | 7 days, no card, chosen on Stage 5 with **Continue with 7 Days Free** |
| **When the 7 days start** | When the Counterparty accepts. Drafts and pending invites use no days |
| **If the 7 days end with no card** | Stage 6 pauses. Nothing is lost |
| **Extra Week** | One free extra 7 days, once per relationship |
| **The other person** | Never pays, and never sees a price, a trial or a card |
| **Groups and networks** | Later. Not part of v2 |

## How It Works

### 1. Choose the free week on Stage 5

Stage 5 sends the invite. The button reads **Continue with 7 Days Free**, and the line above it says the trial starts when they accept.

### 2. Watch the days on Payment

Once they accept, the **Payment** page shows the days left and the date the trial ends.

![Payment page: one card per relationship with Status, Trial Ends, After the Trial $9.99 / month, Card, and How Trials Work.](../assets/payment/payment-desktop.png)

*Initiator · Payment · desktop*

### 3. Add a card, or let it pause

Add a card before the trial ends and Stage 6 keeps running. If you don't, Stage 6 pauses, and you can resume it with **Add a Card** or **Get 7 More Days Free** (once). See [When a Relationship Pauses](../guides/initiator/when-a-relationship-pauses.md).

## Good to Know

- **One plan.** Family was removed ([PR #1237](https://github.com/riolabs-ai/alignsynch/pull/1237)), and Single Annual is being removed ([PR #1241](https://github.com/riolabs-ai/alignsynch/pull/1241)). Groups and networks come later.
- **Each relationship is one Basic membership.** A second relationship is a second $9.99 / month after its own free week (see the delta below on how main counts trials).

## For the Build Team

**Acceptance**

- [ ] Pricing shows one card, **Basic · $9.99 / month**, with no "Most Popular" ribbon on a lone card.
- [ ] Unsure strip: **Not Sure Yet? Try Basic Free for 7 Days. Your Trial Starts When They Accept.**
- [ ] Payment shows the chosen plan's own price ([#1230](https://github.com/riolabs-ai/alignsynch/issues/1230)).

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/membership-plans.ts:135` | "plan("single", "Single", "1 relationship", 1, "basic", "month")," | Main sells Single… |
| `data/membership-plans.ts:136` | "plan("annual", "Single Annual", "1 relationship · 2 months free", 1, "basic", "year")," | …and Single Annual. PR #1241 removes it and renames Single to Basic. |
| `data/billing-plans.ts:169` | "monthlyCents: 999," | $9.99 a month is the authored price. |
| `data/pages/pricing.ts:44` | "{ id: "most-popular", label: "Most Popular" }," | The ribbon still exists; it must not show on a single card. |
| `lib/billing/trial.ts:32` | "export const TRIAL_DAYS = 7;" | The trial is 7 days. |
| `lib/flow/store.ts:1153` | "await grantAcceptanceTrial(sqlOf(client), {" | The trial is written when the invite is claimed (accepted). |
| `lib/db/billing.ts:234` | "one account, one trial, whichever" | Main grants **one trial per account**, not per relationship. |
| `data/pages/payment.ts:155` | "7 days free per relationship, no card needed" | …while Payment promises 7 days per relationship. One of the two must change. |

**Open deltas:** Basic-only catalogue ([PR #1241](https://github.com/riolabs-ai/alignsynch/pull/1241), open) · per-plan price on Payment ([#1230](https://github.com/riolabs-ai/alignsynch/issues/1230)) · trial-per-account vs "per relationship" wording.

## References

| Shot | Source | Original |
|---|---|---|
| payment-desktop | **Bundle** 08 | `spec-design-v2-bundles/08-spec-design-page-payment-v2/reference/payment-1280.png` |

The bundle 02 pricing render still shows three cards (Single, Family, Single Annual), so it's not used here. Recapture pricing after PR #1241 merges.
