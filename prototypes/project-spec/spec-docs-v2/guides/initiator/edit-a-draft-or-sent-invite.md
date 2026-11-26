---
title: Edit a Draft or Sent Invite
summary: Fix a typo or a title after sending, without starting over.
audience: [Initiator]
status: "Built (#1144, #1148) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-edit-invited-*"
  - "bundle: spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-draft-*, rd-invite-sent-*"
  - "code: main @ 601ce26"
---
# Edit a Draft or Sent Invite

Until they accept, the relationship is still yours to shape. A draft opens back in the wizard where you left it. A sent invite can still be edited too: the title, their name, their email and the Aspects. Once Stage 6 is live, Aspects lock and changes are proposed instead.

## At a Glance

| State | What you can change | How |
|---|---|---|
| **Draft** | Everything | **Continue Setup** |
| **Invite sent, not accepted** | Title, their name and email, Aspects | **Edit** on the relationship |
| **Stage 6 live** | Aspects only by agreement | **Propose a Change** |

## How It Works

### A draft

![Relationship Detail for a draft: Not sent yet, with Continue Setup.](../../assets/relationship-detail/draft-desktop.png)

*Initiator · Draft*

### A sent invite

![Relationship Detail after sending: Waiting on Elena, with edit and invite controls.](../../assets/relationship-detail/invite-sent-desktop.png)

*Initiator · Invite Sent*

![The wizard reopened on a sent invite, with an editing banner.](../../assets/wizard/edit-invited-desktop.png)

*Initiator · editing a sent invite*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/dashboard-relationships.ts:277` | "{ id: "continue", label: "Continue Setup" }," | Drafts reopen in setup. |
| `data/pages/dashboard-relationship-detail.ts:410` | "heading: "Edit this relationship"," | Edit panel; heading is sentence case. |
| `data/pages/dashboard-relationship-detail.ts:504` | "{ id: "preview", label: "Check the cost" }," | Edits after answers are priced in answers first. |
| `data/pages/dashboard-relationship-detail.ts:346` | "{ id: "locked-now", label: "Aspects are locked while Stage 6 is live." }," | Live lock. |

**Open deltas:** Title Case on "Edit this relationship", "Check the cost", "Save the change".

## References

| Shot | Source | Original |
|---|---|---|
| draft-desktop | **Bundle** 03 | `spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-draft-1280.png` |
| invite-sent-desktop | **Bundle** 03 | `spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-invite-sent-1280.png` |
| edit-invited-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-edit-invited-1280.png` |
