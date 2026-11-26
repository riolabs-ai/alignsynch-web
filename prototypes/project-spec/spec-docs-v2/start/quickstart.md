---
title: Quickstart
summary: From picking a template to seeing Align, in about ten minutes.
audience: [Initiator]
status: "Built (#1144, #1147, #1173, #1145) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/"
  - "bundle: spec-design-v2-bundles/02-spec-design-page-onboarding-v2/reference/"
  - "bundle: spec-design-v2-bundles/10-spec-design-page-assessment-v2/reference/"
  - "code: main @ 601ce26"
---
# Quickstart

This is the shortest path through AlignSynch. You'll set up one relationship, invite one person, and both answer. No card is asked for at any point here.

## At a Glance

| Step | Where | Time |
|---|---|---|
| 1. Pick a template | **Relationship Templates** | 1 min |
| 2. Stages 1–3: Details, Settings, Aspects | **Create Relationship** | 3 min |
| 3. Stage 4: Account | Sign up or sign in | 1 min |
| 4. Stage 5: Invite | **Continue with 7 Days Free** | 1 min |
| 5. They accept, Stage 6 goes live | Their email link | 1 min for them |
| 6. Both answer, then open Align | **Start Assessment** | 3–5 min each |

## How It Works

### 1. Pick a template

Open **Relationship Templates**, choose one that fits, and press **Create Relationship**. See [Pick a Template](../guides/initiator/pick-a-template.md).

### 2. Fill in Stages 1–3

Give the relationship a title, name the other person and add their email (Stage 1). Choose the Opinions Mode and Alignment Setting (Stage 2). Review, edit or add Aspects (Stage 3).

![Create Relationship, Stage 1 Details: title, both names, the invite email and a description, with the stage rail on the left.](../assets/wizard/stage-1-details-desktop.png)

*Initiator · Stage 1 Details · desktop*

### 3. Create your account (Stage 4)

Stage 4 is only an account: a name, an email and a password. No card.

### 4. Send the invite (Stage 5)

Check the preview of what they'll see, then press **Continue with 7 Days Free**. The invite goes out, and your 7 free days wait until they accept.

![Stage 5 Invite: their name and email, your message, a preview of what Elena sees, and Continue with 7 Days Free.](../assets/wizard/stage-5-invite-desktop.png)

*Initiator · Stage 5 Invite · desktop*

### 5. They accept

They open the link, create an account with the invited email, and press **Accept Invitation**. Stage 6 goes live for both of you.

### 6. Answer, then open Align

Each of you presses **Start Assessment** and answers one Aspect at a time. When you've both finished, Align opens with the results.

![The answer screen: Round 1 · Aspect 1 of 5, the 1–5 scale and the save status.](../assets/assessment/answer-desktop.png)

*Initiator · Round 1 answer screen*

## Good to Know

- **Save and Exit** is on every stage. A draft costs nothing and uses no trial days.
- If they don't accept, you can copy the link, resend it, or cancel it. See [Copy, Resend or Cancel an Invite](../guides/initiator/copy-resend-or-cancel-an-invite.md).

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/assessment-create.ts:255` | "{ id: "free-continue", label: "Continue with 7 days free" }" | Stage 5's primary action exists, but in sentence case. Spec: **Continue with 7 Days Free**. |
| `data/pages/assessment-create.ts:376` | "{ id: "submit", label: "Continue to Stage 5" }" | Stage 4 hands off to Stage 5. |
| `data/pages/invite.ts:150` | "{ id: "accept", label: "Accept Invitation" }" | The Counterparty's accept button. |
| `data/pages/dashboard-relationship-detail.ts:211` | "{ id: "start", label: "Start Assessment" }" | The Next Step card starts the answer screen. |

**Open deltas:** Title Case on "Continue with 7 days free", "Create your account", "Send the invitation" (see the Initiator guide pages).

## References

| Shot | Source | Original |
|---|---|---|
| stage-1-details-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-1280.png` |
| stage-5-invite-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-stage5-1280.png` |
| answer-desktop | **Bundle** 10 | `spec-design-v2-bundles/10-spec-design-page-assessment-v2/reference/assessment-1280.png` |
