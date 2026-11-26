---
title: Payment
summary: See every relationship you cover, its trial, and what happens next, on one page.
audience: [Initiator]
status: "Built (#1156 via #1170) · Planned: Basic-only price (https://github.com/riolabs-ai/alignsynch/pull/1241), per-plan price line (https://github.com/riolabs-ai/alignsynch/issues/1230)"
sources:
  - "bundle: spec-design-v2-bundles/08-spec-design-page-payment-v2/reference/"
  - "bundle: spec-design-v2-rc1.3-bundle/08-payment-page-plan-price-1230/"
  - "issues: #1132, #1230"
  - "code: main @ 601ce26"
---
# Payment

**Payment** is the one place that answers "what am I paying for?". Each relationship you started has its own card with its status, its trial dates, what it costs after the trial, and whether a card is on file. Relationships you were invited to don't appear; someone else covers those.

## At a Glance

| Part | What it shows |
|---|---|
| **Memberships** | One card per relationship: Status, Trial Ends, After the Trial, Card |
| **Payment Method** | Your card, or **Add a Card** |
| **Billing History** | Past charges, or "No charges yet." |
| **How Trials Work** | The five trial rules in one list |

## How It Works

![Payment with four membership cards and How Trials Work.](../../assets/payment/payment-desktop.png)

*Initiator · Payment · desktop*

<img src="../../assets/payment/payment-mobile.png" alt="Payment on a phone" width="320" />

*mobile*

![Payment arriving from a paused relationship, with that card highlighted.](../../assets/payment/payment-paused-desktop.png)

*Initiator · Payment from a paused relationship*

## For the Build Team

**Acceptance**

- [ ] Every card's "After the Trial" line reads **$9.99 / month** (Basic), the plan the Initiator actually holds ([#1230](https://github.com/riolabs-ai/alignsynch/issues/1230)).
- [ ] The Counterparty's Payment view reads only **{name} covers this relationship.** and **You're never charged.** No price, trial or card.

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/payment.ts:52` | "heading: "Memberships"," | Section. |
| `data/pages/payment.ts:61` | "{ id: "after-trial", label: "After the Trial" }," | Price row. |
| `data/pages/payment.ts:152` | "heading: "How Trials Work"," | Rules panel. |
| `data/pages/payment.ts:170` | "{ id: "covered", label: "{initiator} covers this relationship." }," | Counterparty view. |

**Open deltas:** per-plan price ([#1230](https://github.com/riolabs-ai/alignsynch/issues/1230)) and the Basic-only catalogue ([PR #1241](https://github.com/riolabs-ai/alignsynch/pull/1241)) are not on main yet.

## References

| Shot | Source | Original |
|---|---|---|
| payment-desktop | **Bundle** 08 | `spec-design-v2-bundles/08-spec-design-page-payment-v2/reference/payment-1280.png` |
| payment-mobile | **Bundle** 08 (cropped to the top 2200 px) | `spec-design-v2-bundles/08-spec-design-page-payment-v2/reference/payment-390.png` |
| payment-paused-desktop | **Bundle** 08 | `spec-design-v2-bundles/08-spec-design-page-payment-v2/reference/payment-paused-1280.png` |

The bundle 08 render predates the one-plan decision but already prints $9.99 / month on every card.
