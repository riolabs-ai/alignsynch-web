---
title: Accept or Decline an Invite
summary: Join in three short steps, or say no thanks in one click.
audience: [Counterparty]
status: Built (#1147) · design deltas open
sources:
  - "bundle: spec-design-v2-bundles/02-spec-design-page-onboarding-v2/reference/join-*"
  - "bundle: spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-joined-landing-counterparty-*"
  - "issues: #1125"
  - "code: main @ 601ce26"
---
# Accept or Decline an Invite

Someone who matters to you wants to compare notes. The invite shows you who it's from, what it's about, and the Aspects you'd answer, before you decide anything. Joining takes three short steps. If it's not for you, one click says no, and you don't have to explain.

## At a Glance

| Step | What you do |
|---|---|
| **1 · Invite** | Read who invited you, the relationship, and its Aspects. Press **Join {name}** |
| **2 · Join** | Create your account with the email the invite was sent to |
| **3 · Accept** | Press **Accept Invitation**. Stage 6 goes live for both of you |
| **Not for you?** | **Decline the invitation**. The link stops working |

## How It Works

### 1. Read the invite

![Step 1 of 3: Marcus invited you to align on Staying Close Through Busy Seasons, with the Aspects preview and Join Marcus.](../../assets/counterparty/join-step-1-desktop.png)

*Elena (Counterparty) · Step 1 Invite*

<img src="../../assets/counterparty/join-step-1-mobile.png" alt="Step 1 on a phone" width="320" />

*mobile*

### 2. Create your account

Use the email you were invited at, so they know it's you.

![Step 2 of 3: Create Your Account with name and email.](../../assets/counterparty/join-step-2-desktop.png)

*Elena (Counterparty) · Step 2 Join*

### 3. Accept

You join as the Counterparty. When you accept, Stage 6 goes live and your first Assessment opens. You can also suggest a change to the Aspects (optional).

![Step 3 of 3: Accept the Invitation, with an optional Suggest a Change to the Aspects.](../../assets/counterparty/join-step-3-desktop.png)

*Elena (Counterparty) · Step 3 Accept*

### 4. You've joined

![You've Joined: the relationship page with Start Assessment as the next step.](../../assets/counterparty/joined-landing-desktop.png)

*Elena (Counterparty) · You've Joined*

### Or decline

![Invitation Declined: Marcus will see that you said no thanks. Done.](../../assets/counterparty/declined-desktop.png)

*Elena (Counterparty) · Invitation Declined*

## Good to Know

- **Invites last seven days.** If yours has expired, ask the person who invited you to send a new one.
- **Your answers stay private** until you've both answered.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/invite.ts:109` | "{ id: "join", label: "Join {initiator}" }," | Step 1 action. |
| `data/pages/invite.ts:110` | "{ id: "decline", label: "Not for you? Decline the invitation" }," | One-click decline; Title Case needed on "Decline the Invitation". |
| `data/pages/invite.ts:121` | "heading: "Create Your Account"," | Step 2. |
| `data/pages/invite.ts:150` | "{ id: "accept", label: "Accept Invitation" }," | Step 3. |
| `data/pages/invite.ts:171` | "heading: "Invitation Declined"," | Declined state. |
| `data/pages/invite.ts:44` | "heading: "You have been invited"," | Page heading in sentence case. |

**Open deltas:** Title Case on "You have been invited" and "Decline the invitation"; one expired-invite variant on this page still names the other person's account status in words this seat should never read (see [#1225](https://github.com/riolabs-ai/alignsynch/issues/1225)).

## References

| Shot | Source | Original |
|---|---|---|
| join-step-1-desktop | **Bundle** 02 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| join-step-1-mobile | **Bundle** 02 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| join-step-2-desktop | **Bundle** 02 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| join-step-3-desktop | **Bundle** 02 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| joined-landing-desktop | **Bundle** 03 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| declined-desktop | **Bundle** 02 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
