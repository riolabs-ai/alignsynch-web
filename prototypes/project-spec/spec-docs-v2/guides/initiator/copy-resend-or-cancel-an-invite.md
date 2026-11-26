---
title: Copy, Resend or Cancel an Invite
summary: Stay in control of who can still join.
audience: [Initiator]
status: "Built (#1149 via #1170) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-invited-details-*, modal-cancel-invite-*"
  - "issues: #1135"
  - "code: main @ 601ce26"
---
# Copy, Resend or Cancel an Invite

Sometimes an email gets lost, or you change your mind. While an invite is waiting, you can share the link yourself, send it again, or cancel it. Cancelling turns the relationship back into a draft, so nothing you set up is lost.

## At a Glance

| Action | What happens |
|---|---|
| **Copy Invite Link** | Copies the link so you can send it another way |
| **Resend Invite** | Sends a fresh link to the same address; the old one stops working |
| **Cancel Invite** | The link stops working and the relationship becomes a draft again |

## How It Works

![Details tab while invited: Copy Invite Link, Resend Invite and Cancel Invite.](../../assets/relationship-detail/invited-details-desktop.png)

*Initiator · Invitation controls*

![Cancel This Invite? The link stops working; your draft stays. Cancel Invite / Keep Invite.](../../assets/relationship-detail/cancel-invite-desktop.png)

*Initiator · Cancel This Invite?*

<img src="../../assets/relationship-detail/cancel-invite-mobile.png" alt="Cancel invite dialog on a phone" width="320" />

*mobile*

## Good to Know

- Resends are rate-limited. If you see "An invite went out recently", try again shortly.
- Invites last seven days.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/dashboard-relationship-detail.ts:640` | "{ id: "copy", label: "Copy Invite Link" }," | Copy. |
| `data/pages/dashboard-relationship-detail.ts:644` | "{ id: "resend", label: "Resend Invite" }," | Resend. |
| `data/pages/dashboard-relationship-detail.ts:659` | "{ id: "cancelled", label: "Invitation Cancelled at {instant}. This is a draft again." }," | Cancel returns to draft. |
| `data/pages/dashboard-relationships.ts:313` | "heading: "Cancel This Invite?"," | Confirm dialog. |
| `data/pages/invite.ts:191` | "body: "Invitations last seven days. Ask {initiator} to send you a new one."," | Seven-day link. |

**Open deltas:** none found in copy; no QA capture of the built controls.

## References

| Shot | Source | Original |
|---|---|---|
| invited-details-desktop | **Bundle** 03 | `spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-invited-details-1280.png` |
| cancel-invite-desktop | **Bundle** 03 | `spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/modal-cancel-invite-1280.png` |
| cancel-invite-mobile | **Bundle** 03 | `spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/modal-cancel-invite-390.png` |
