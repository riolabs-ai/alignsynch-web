---
title: v2 Design Inventory
summary: Every v2 design and feature, who it's for, what it gives them, its status and its best screenshot, with gaps flagged.
audience: [Jaden, Hermes, build team]
status: Draft · 19 Nov 2026 (updated after the docs pass)
sources:
  - spec-design-v2-bundles/ (bundles 01–12, 16 Nov)
  - spec-design-v2-prototype/ (served, 18 Nov later calls)
  - launch-desk/prototype-gap-2026-11-18.md
  - GitHub PR states read on 19 Nov (read-only)
---

# v2 Design Inventory

**Shot tiers, in priority order:** **B** = Bundle reference render · **Q** = QA capture of the built app · **S** = spec or repo asset · **P** = prototype render · **—** = none.
**Design status:** Designed (bundle) · Prototype Only · Planned (no screen) · Removed.
**App:** the PR that shipped it, or *confirm* when it isn't verified.
Bundle paths are short for `spec-design-v2-bundles/NN-*/reference/`. **P** shots taken 18 Nov are on the box at `/workspace/alignsynch/out/new-surfaces-shots/`.

## Get Started and Initiator

| # | Feature | Audience | Value for the person | Design | App | Best shot | Gap |
|---|---|---|---|---|---|---|---|
| 1 | Public Relationship Templates catalog and public template page | Visitor → Initiator | Pick a relationship like yours before signing up | Designed | 1.22 (#1159/#1161/#1170), confirm | **B** 02 `relationship-templates-1280`, `relationship-template-public-1280` | |
| 2 | Pricing → template pick (plan carried into the wizard) | Visitor → Initiator | Choose a plan and keep it through setup | Designed | 1.22 (#1170), confirm | **B** 02 `pricing-1280`, `relationship-templates-from-pricing-1280` | |
| 3 | Wizard Stages 1–2: Details and Settings | Initiator | Name the relationship and its goal in a minute | Designed | confirm | **B** 01 `wizard-1280`, `wizard-stage2-1280` | |
| 4 | Stage 3 Aspects and the Aspect drawer | Initiator | Choose what you'll compare; edit or add Aspects | Designed | confirm | **B** 01 `wizard-stage3-1280`, `drawer-edit-1280` | |
| 5 | Stage 4: account only | Initiator | Sign up with no card asked for | Designed | #1190 return after sign-in | **B** 01 `wizard-stage4-1280` | Return-after-sign-in hop not shown (routing only) |
| 6 | Stage 5 Invite: **Continue with 7 Days Free**, plan chip | Initiator | Send the invite; the free days wait until they accept | Designed | #1217 Back → Stage 4 | **B** 01 `wizard-stage5-1280`, `wizard-stage5-plan-1280` | |
| 7 | Draft and sent invite stay editable | Initiator | Fix a typo after sending | Designed | confirm | **B** 01 `wizard-edit-invited-1280`; 03 `rd-draft-1280`, `rd-invite-sent-1280` | |
| 8 | Invitation hygiene: Copy Link, Resend, Cancel Invite | Initiator | Control who can still join | Designed | confirm | **B** 03 `rd-invited-details-1280`, `modal-cancel-invite-1280` | |
| 9 | Couldn't Create This Draft · Try Again Shortly | Initiator | A calm, honest message instead of a blank page | Prototype Only | #1210 shipped a named 500, not this UI | **P** `create-failed-1280/390` | No bundle reference; rc1 bug capture `v2rc1-bug-create-loop.png` shows the old failure |
| 10 | Start and My Relationships (list, empty, paused, kebab) | Initiator | One place for every relationship and its next step | Designed | confirm | **B** 05 `start-1280`, `my-relationships-1280`, `my-relationships-paused-1280`, `kebab-relationship-1280` | |
| 11 | Templates: Library / My Templates, detail, proposal, archive / restore | Initiator | Reuse and refine your own templates; never lose one | Designed | confirm | **B** 06 `templates-1280`, `templates-mine-1280`, `my-template-detail-1280`, `template-proposal-1280` | |
| 12 | Chat | Both | Talk it through next to the results | Designed | rc1 notes say chat does not persist (#1189) | **B** 07 `chat-1280`, `chat-relationship-1280`, `chat-relationship-paused-1280` | |

## Counterparty

| # | Feature | Audience | Value for the person | Design | App | Best shot | Gap |
|---|---|---|---|---|---|---|---|
| 13 | Join steps 1–3 | Counterparty | Accept in a few clicks, never charged | Designed | confirm | **B** 02 `join-step1/2/3-1280` | |
| 14 | One-click Decline | Counterparty | Say no without explaining | Designed | confirm | **B** 02 `join-declined-1280` | |
| 15 | You've Joined landing | Counterparty | Know what happens next | Designed | confirm | **B** 03 `rd-joined-landing-counterparty-1280` | |
| 16 | Save These Aspects as a My Template (Counterparty fork) | Counterparty | Keep the questions for your own relationships | Designed | confirm | **B** 03 `rd-live-aspects-counterparty-1280` | |
| 17 | Leave Relationship / Request My Removal (closed, never deleted) | Both | Step away without erasing the other person's results | Designed (DESIGN-NOTES §42) | confirm | **—** | No reference render of the Closed banner or removal request (flow10 tests it, but there is no shot) |

## Stage 6 (both people)

| # | Feature | Audience | Value for the person | Design | App | Best shot | Gap |
|---|---|---|---|---|---|---|---|
| 18 | Assessment: one Aspect at a time, save and resume, review, sealed for Round 1 | Both | Answer honestly at your own pace | Designed | #1173 | **B** 10 `assessment-1280`, `assessment-counterparty-1280`, `assessment-resume-390` | |
| 19 | Save status chips: Saves as You Go · Saving… · ✓ Saved · Not Saved · Pick Again | Both | Trust that every answer is kept | Prototype Only | #1173 shipped text-only chips (flagged) | **P** `assessment-chip-*-1280/390` | No bundle reference |
| 20 | Waiting and Results In | Both | Know who you're waiting on | Designed | confirm | **B** 03 `rd-waiting-initiator-1280`, `rd-waiting-counterparty-1280` | |
| 21 | Align: Soft / Full re-score, status summary | Both | See where you match and where you don't | Designed | confirm | **B** 04 `align-1280` | |
| 22 | Propose a change on locked Aspects | Both | No silent edits; both agree first | Designed | confirm | **B** 03 `modal-propose-1280`, `proposal-incoming-1280` | |

## Plans & Trial

| # | Feature | Audience | Value for the person | Design | App | Best shot | Gap |
|---|---|---|---|---|---|---|---|
| 23 | Trial running and Payment tab (countdown only after accept) | Initiator | Know exactly when the free days end | Designed | confirm | **B** 03 `rd-live-payment-1280`; 08 `payment-1280` | |
| 24 | Trial ended → Stage 6 paused, one free Extra Week, Extra Week Ended | Initiator | Nothing lost; resume in one step | Designed | Built (#1143, #1236 merged); Initiator lapse line still says "Align is paused" | **B** 03 `rd-trial-ended-initiator-1280`, `rd-trial-ended-extended-initiator-1280` | |
| 25 | Counterparty paused view, "Marcus covers this relationship" | Counterparty | Nothing to do, never asked to pay | Designed | confirm | **B** 03 `rd-trial-ended-counterparty-1280`; 08 `payment-counterparty-1280` | |
| 26 | Answer screen while paused (Initiator **Paused** · Counterparty **Paused · Waiting on {name}**) | Both | Answers are safe while paused | Designed (rc1.3 bundle 01) | Built: [PR #1235](https://github.com/riolabs-ai/alignsynch/pull/1235) merged; old headings still on main | **B** rc1.3 01 `assessment-paused-*`, `assessment-lapsed-*` | Shots predate the settled copy |
| 27 | Basic $9.99/month, the one plan, on Pricing and Payment | Initiator | See the plan you actually hold | Planned | [PR #1241](https://github.com/riolabs-ai/alignsynch/pull/1241) open (Single Annual removed); #1230 per-plan price | **B** 08 `payment-1280` | Pricing render shows three cards; `wizard-stage5-plan-1280` shows the removed Family chip |
| 28 | Family plan and Family at capacity (4 of 4) | Initiator | — | Removed | #1229 closed; [PR #1237](https://github.com/riolabs-ai/alignsynch/pull/1237) | **—** | Removed 19 Nov 2026 (merged). Single Annual removed by PR #1241 (open). One plan: Basic $9.99/month. |

## Account & Settings

| # | Feature | Audience | Value for the person | Design | App | Best shot | Gap |
|---|---|---|---|---|---|---|---|
| 29 | Account menu (name, email, Account Settings, Sign Out) | Everyone | Get to your account from any page | Designed | #1152 closed; confirm | **B** 11 `account-menu-1280` | |
| 30 | Settings: Profile, Password, Session; Notifications removed | Everyone | Fewer, honest controls | Prototype Only (current) | confirm | **P** `settings-1280/390` | **B** 11 `settings-1280` is stale: it still shows Notifications and the 30-day text |
| 31 | Delete Account: immediate, can't be restored | Everyone | A clear, final choice | Prototype Only (current) | #1163 (copy) | **P** `settings-delete-confirm-1280/390` | Bundle reference stale; prod capture `alignsynch-prod-captures/0004` is v1.16 |

## Admin

| # | Feature | Audience | Value for the person | Design | App | Best shot | Gap |
|---|---|---|---|---|---|---|---|
| 32 | CRUD & Permissions matrix | Admin | One read-only answer to "who can do what" | Designed | #1157, #1179 (deltas open) | **B** 12 `admin-crud-matrix-1280`, `-filtered-`, `-broken-` | No QA capture of the built page |
| 33 | Email Templates admin (register and override editor) | Admin | Fix email copy without a deploy | Planned (no design) | #1167 | **—** | No shot anywhere |

## Emails and comms

| # | Feature | Audience | Value for the person | Design | App | Best shot | Gap |
|---|---|---|---|---|---|---|---|
| 34 | "Your 7 days free start today" (Initiator, free-trial only) | Initiator | Know the clock started | Planned (copy only) | PR #1240 (open) | **—** | Not on main; no render |
| 35 | Counterparty Joined email, "Relationship" not "session" | Initiator | Know they're in | Built (copy only) | #1195 merged; trial-line fix in PR #1240 (open) | **—** | No render |
| 36 | Paused emails split by seat (`trial-ended-paused` / `relationship-paused`) | Both | Each person hears only what applies to them | Built (copy only) | #1168 merged; subjects still say "Align is paused" | **—** | No render |
| 37 | FAQ "How do I get started?" (v2 path) | Visitor | A correct answer before signing up | Planned | PR #1238 (open) | **S** rc1.3 06 repo-spec shots | Not in docs.json |
| 38 | OG and release banners (email, readme, release default) | Everyone | Consistent, on-brand shares | Built | #1177 | **S** repo `public/og/*.png` | Not copied locally |

## Reference and system

| # | Feature | Audience | Value for the person | Design | App | Best shot | Gap |
|---|---|---|---|---|---|---|---|
| 39 | Tokens, status language (icon plus word), 1–5 scale, no red | Everyone | Calm, readable status at a glance | Designed | confirm | **B** 09 `baseline-1280`, `patterns-1280`; **P** `palette-/scale-/summary-before-after.png` | |
| 40 | Flow map, including Later Calls · 18 Nov | Team | See every state in one place | Designed + Prototype | n/a | **B** 09 `index-1280`; **P** `flow-map-later-calls-1280` | |
| 41 | `spec-stages/Preview List Titles New.avif` | ? | ? | Unknown | ? | **S** (couldn't decode) | Not reviewed. Need Jaden to say what it is |

## Counts

| Best available shot | Rows |
|---|---|
| Bundle reference (current) | 27 |
| Prototype only | 5 (#9, #19, #26, #30, #31) |
| Spec or repo asset | 1 (#38), plus 1 unreviewed (#41) |
| No shot at all | 6 (#17, #33, #34, #35, #36, #37) |
| Removed | 1 (#28) |
| **Total** | **41** |

**QA tier:** no row has a QA capture of the built v2 app. The QA atlases on prodesk (`qa-atlas-v1.17.0/1.17.1-full-size.zip`, `alignsynch-qa-atlas-v1.20.0.docx`) and `~/qa/t_*-975` predate v2. They can serve as "before" images or for Administration pages about older admin tools (audit, billing, templates, docs).

## Docs Pages

Every page in `docs.json`, with the status written in its frontmatter (generated from the files on disk).

| Page | Status |
|---|---|
| [What Is AlignSynch](start/what-is-alignsynch.md) | Built (v2.0.0-rc1.2 on main) · design deltas open per guide |
| [Quickstart](start/quickstart.md) | Built (#1144, #1147, #1173, #1145) · design deltas open |
| [Core Concepts](start/core-concepts.md) | Built (v2.0.0-rc1.2) · glossary deltas open |
| [Plans and the Free Trial](start/plans-and-trial.md) | Planned (Basic only: https://github.com/riolabs-ai/alignsynch/pull/1241) · trial Built (#1116, #1117, #1143) |
| [Pick a Template](guides/initiator/pick-a-template.md) | Built (#1170, via #1159 / #1127) · design deltas open |
| [Set Up Details, Settings and Aspects](guides/initiator/set-up-details-settings-and-aspects.md) | Built (#1144, drawer via #1170 / #1133) · design deltas open |
| [Create Your Account](guides/initiator/create-your-account.md) | Built (#1144, #1190) · design deltas open |
| [Send the Invite](guides/initiator/send-the-invite.md) | Built (#1144, #1217) · design deltas open |
| [Edit a Draft or Sent Invite](guides/initiator/edit-a-draft-or-sent-invite.md) | Built (#1144, #1148) · design deltas open |
| [Copy, Resend or Cancel an Invite](guides/initiator/copy-resend-or-cancel-an-invite.md) | Built (#1149 via #1170) · design deltas open |
| [If a Draft Can't Be Created](guides/initiator/if-a-draft-cant-be-created.md) | Planned (https://github.com/riolabs-ai/alignsynch/issues/1226) · #1210 shipped a named 500 without this screen |
| [My Relationships and Start](guides/initiator/my-relationships-and-start.md) | Built (#1150 via #1170) · design deltas open |
| [My Templates](guides/initiator/my-templates.md) | Built (#1151, #1153 via #1170) · design deltas open |
| [Your 7 Days Free](guides/initiator/your-7-days-free.md) | Built (#1116, #1117, #1156 via #1170) · design deltas open |
| [When a Relationship Pauses](guides/initiator/when-a-relationship-pauses.md) | Built (#1143, #1235, #1236) · design deltas open |
| [Add a Card or Take Your Extra Week](guides/initiator/add-a-card-or-take-your-extra-week.md) | Built (#1143, #1156 via #1170) · design deltas open |
| [Payment](guides/initiator/payment.md) | Built (#1156 via #1170) · Planned: Basic-only price (https://github.com/riolabs-ai/alignsynch/pull/1241), per-plan price line (https://github.com/riolabs-ai/alignsynch/issues/1230) |
| [Accept or Decline an Invite](guides/counterparty/accept-or-decline-an-invite.md) | Built (#1147) · design deltas open |
| [When a Relationship Pauses](guides/counterparty/when-a-relationship-pauses.md) | Built (#1143, #1236) · design deltas open |
| [Save These Aspects as a Template](guides/counterparty/save-these-aspects-as-a-template.md) | Built (#1153 via #1170) · design deltas open |
| [Ask to Be Removed](guides/counterparty/ask-to-be-removed.md) | Built (#1149 via #1170) · no shot |
| [Answer the Assessment](guides/shared/answer-the-assessment.md) | Built (#1173, #1235) · design deltas open |
| [Results and Align](guides/shared/results-and-align.md) | Built (#1145, #1148) · design deltas open |
| [Propose a Change](guides/shared/propose-a-change.md) | Built (#1155 via #1170) · design deltas open |
| [Chat and Discussion](guides/shared/chat-and-discussion.md) | Built (#1154 via #1170) · chat does not persist yet |
| [Leave a Relationship](guides/shared/leave-a-relationship.md) | Built (#1149 via #1170) · no shot |
| [Account Menu](guides/account/account-menu.md) | Built (#1152 via #1170) |
| [Profile and Password](guides/account/profile-and-password.md) | Built (#1152 via #1170) · bundle refresh open (https://github.com/riolabs-ai/alignsynch/issues/1233) |
| [Delete Your Account](guides/account/delete-your-account.md) | Built (#1163, lib/account/purge.ts) |
| [CRUD & Permissions](guides/admin/crud-and-permissions.md) | Built (#1157, #1179) · design deltas open |
| [Email Templates](guides/admin/email-templates.md) | Built (#1167) · design deltas open (https://github.com/riolabs-ai/alignsynch/issues/1231, https://github.com/riolabs-ai/alignsynch/pull/1242) |
| [Who Sees the Admin Rail](guides/admin/who-sees-the-admin-rail.md) | Built (#1157, #1167, nav-menu.json) |
| [Stage 1 · Details](reference/stages/stage-1-details.md) | Built (#1144) · design deltas open |
| [Stage 2 · Settings](reference/stages/stage-2-settings.md) | Built (#1144) · design deltas open |
| [Stage 3 · Aspects](reference/stages/stage-3-aspects.md) | Built (#1144) · design deltas open |
| [Stage 4 · Account](reference/stages/stage-4-account.md) | Built (#1144) · design deltas open |
| [Stage 5 · Invite](reference/stages/stage-5-invite.md) | Built (#1144) · design deltas open |
| [Stage 6 · Align](reference/stages/stage-6-align.md) | Built (#1144, #1147, #1148) · design deltas open |
| [Relationship States by Role](reference/states/relationship-states-by-role.md) | Built (#1148, #1143) · design deltas open |
| [Status Chips](reference/states/status-chips.md) | Built (#1145, #1150) · design deltas open |
| [The Answer Scale](reference/states/answer-scale.md) | Built (#1173) |
| [Invitation Email](reference/emails/invitation.md) | Built |
| [Counterparty Joined Email](reference/emails/counterparty-joined.md) | Built · design deltas open (https://github.com/riolabs-ai/alignsynch/issues/1227, https://github.com/riolabs-ai/alignsynch/pull/1240) |
| [Trial Started Line](reference/emails/trial-started.md) | Planned (https://github.com/riolabs-ai/alignsynch/pull/1240) |
| [Paused Email (Initiator)](reference/emails/paused-initiator.md) | Built (#1168) · design deltas open |
| [Paused Email (Counterparty)](reference/emails/paused-counterparty.md) | Built (#1168) · design deltas open |
| [Release Notes and Banners](reference/emails/release-notes-and-banners.md) | Built (#1177, #1193) |
| [Glossary](reference/copy/glossary.md) | Designed |
| [Retired Terms](reference/copy/retired-terms.md) | Designed |
| [Copy Rules](reference/copy/copy-rules.md) | Designed |
| [Changelog](reference/changelog.md) | Designed |
