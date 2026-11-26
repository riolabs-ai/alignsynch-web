---
title: Send the Invite
summary: Stage 5 sends one email with one link, and your free week waits until they accept.
audience: [Initiator]
status: "Built (#1144, #1217) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-stage5-*"
  - "issues: #1123, #1115, #1216"
  - "code: main @ 601ce26"
---
# Send the Invite

Stage 5 is where the relationship goes out. You see exactly what the other person will see, then send it. Your 7 free days don't start now; they start when they accept, so a slow reply costs you nothing.

## At a Glance

| | |
|---|---|
| **Primary action** | **Continue with 7 Days Free** (sends the invite) |
| **Secondary action** | **Continue as Draft** (sends nothing) |
| **What they get** | One email, one link, valid for 7 days |
| **When your trial starts** | When they accept |
| **After sending** | You can edit, copy the link, resend or cancel |

## How It Works

![Stage 5 Invite with the What Elena Sees preview and Continue with 7 Days Free.](../../assets/wizard/stage-5-invite-desktop.png)

*Initiator · Stage 5 Invite*

<img src="../../assets/wizard/stage-5-invite-mobile.png" alt="Stage 5 on a phone" width="320" />

*Initiator · Stage 5 · mobile*

1. Check their first name and email, and your message.
2. Read the **What Elena Sees** preview.
3. Press **Continue with 7 Days Free**. The line above reads: "Sends the invite. Your 7-day free trial starts when Elena accepts. No card needed. Elena is never charged."
4. Or press **Continue as Draft** and send it later from **My Relationships**.

## Good to Know

- **Stage 6 · Align** in the rail reads **Starts when Elena joins** until they accept.
- **Back** returns you to Stage 4 (fixed by #1217).

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/assessment-create.ts:255` | "{ id: "free-continue", label: "Continue with 7 days free" }," | Primary action; Title Case needed: **Continue with 7 Days Free**. |
| `data/pages/assessment-create.ts:248` | ""7 days free, no card. The trial starts when the person you invite accepts, and nothing is charged before that."," | The trial anchor is acceptance. |
| `data/pages/assessment-create.ts:416` | "{ id: "draft", label: "Continue as Draft" }," | Secondary action. |
| `data/pages/assessment-create.ts:397` | "heading: "Send the invitation"," | Heading; spec is **Invite {name}** in Title Case. |
| `data/pages/assessment-create.ts:406` | "{ id: "submit", label: "send email to counterparty now" }," | A lower-case leftover label on the send step. |
| `data/pages/assessment-create.ts:482` | "{ id: "align-note", label: "Stage 6 Align starts when {name} joins" }," | Rail note for Stage 6. |

**Open deltas:** Title Case on the primary action and heading; remove "send email to counterparty now"; the plan chip ("{plan} Plan · Saved from Pricing") must name Basic once [PR #1241](https://github.com/riolabs-ai/alignsynch/pull/1241) merges.

## References

| Shot | Source | Original |
|---|---|---|
| stage-5-invite-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-stage5-1280.png` |
| stage-5-invite-mobile | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-stage5-390.png` |

The bundle's `wizard-stage5-plan-1280` render shows the removed Family plan chip ($19.99), so it isn't used.
