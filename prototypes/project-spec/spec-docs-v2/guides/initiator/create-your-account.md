---
title: Create Your Account
summary: Stage 4 is only an account. No card, no plan to pick.
audience: [Initiator]
status: "Built (#1144, #1190) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-stage4-*"
  - "issues: #1123, #1187"
  - "code: main @ 601ce26"
---
# Create Your Account

You need an account so the invite comes from you and your answers are kept. That's all Stage 4 asks for. There's no card and no plan here; your draft waits while you sign up, and you come straight back to Stage 5.

## At a Glance

| | |
|---|---|
| **New here** | Name, email, password, then **Continue to Stage 5** |
| **Already have an account** | Sign in; the wizard returns you to Stage 5 |
| **Not asked for** | A card, a plan, payment details |

## How It Works

![Stage 4 Account: create an account with name, email and password; no card.](../../assets/wizard/stage-4-account-desktop.png)

*Initiator · Stage 4 Account*

<img src="../../assets/wizard/stage-4-account-mobile.png" alt="Stage 4 on a phone" width="320" />

*Initiator · Stage 4 · mobile*

1. Fill in your name, email and a password.
2. Press **Continue to Stage 5**.
3. If you signed in instead, you land back on Stage 5 with your draft intact.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/assessment-create.ts:363` | "heading: "Create your account"," | Heading is sentence case; spec is **Create Your Account**. |
| `data/pages/assessment-create.ts:364` | "body: "Your answers stay on this device until you sign in."," | Stage 4 body. |
| `data/pages/assessment-create.ts:366` | "{ id: "signed-in-heading", label: "You're signed in" }," | Signed-in state. |
| `data/pages/assessment-create.ts:376` | "{ id: "submit", label: "Continue to Stage 5" }," | Stage 4 action. |

**Open deltas:** Title Case "Create Your Account" and "You're Signed In". The return after sign-in was fixed by #1190.

## References

| Shot | Source | Original |
|---|---|---|
| stage-4-account-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-stage4-1280.png` |
| stage-4-account-mobile | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-stage4-390.png` |
