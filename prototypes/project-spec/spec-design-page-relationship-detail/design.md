# AlignSynch Design Standard v2.0.0

## Scope

Use this standard for AlignSynch dashboard surfaces and relationship detail specs. The [Relationship Detail spec](./alignsynch-ui-specs.html) demonstrates the two record types, the template conversion path, and the shared Aspect preview. [Local QuizHub reference](http://localhost:3001/).

The reference checkout was `quizhub/quizhub` at `a04f575f`. Port 3001 did not respond during drafting, so the standard uses the checked-out source and the two supplied design references. Colors below describe the light-theme proposal.

## UI Copy

- Write authored headings, labels, buttons, tabs, chips, hints, and placeholders in Title Case when they are fragments. Use Upper Case for short record-type identifiers and compact metadata labels. Keep articles, conjunctions, and short prepositions lowercase where customary.
- Use sentence case and closing punctuation for complete sentences. A question ends with a question mark. Preserve casing in stored titles, Aspect questions, and opinion endpoints.
- Lead with what the action does. Put its conditions or consequences in nearby sentence copy. State a fact once in the area where the reader uses it.

## Shared Patterns

| Mark | Meaning | Examples |
| --- | --- | --- |
| **L** | Shared across surfaces and locked from surface-specific variation | Dashboard Navigation, header search |
| **V** | Shared base with declared surface variations | Record identity band, facts card, Aspect-list panel |

In review specs, center a 20 px circular badge over the top border and inset it 13 px from the right corner. Use light yellow `#FFF4C8` for L and stronger yellow `#FFE177` for V. Use the letter and accessible name to carry meaning alongside color. Keep the mark visible outside the boundary. The marks are annotations for design review.

L patterns retain the same structure, interaction, keyboard behavior, and hierarchy when reused. V patterns document which slots, actions, labels, or contextual colors may vary. Keep the shared DOM and component interface aligned, and verify supported variants together.

## Color, Contrast, and Grouping

| Surface | QuizHub source | Applied parameters |
| --- | --- | --- |
| Canvas, navigation, and actions | `data/brand.ts`, `app/globals.css`, `components/ui/button.tsx` | White canvas, near-black ink, indigo `#6366F1` action and active navigation, 90% indigo hover, 5 px card radius, warm 1 px borders |
| Start With This Template | `components/quiz/quiz-details.tsx` sidebar and `components/ui/card.tsx` | White bordered Card, 24 px content padding and group spacing, full-width 44 px large Button, 32 px horizontal button padding, 3 px button radius, 14 px medium-weight label. The template copy and destinations fill the QuizHub pattern’s slots. |
| Management tabs | `components/tournaments/tournament-detail.tsx`, `components/ui/tabs.tsx` | 40 px muted rail, 4 px rail inset, 14 px medium-weight triggers, white active trigger with foreground text and a small shadow. Relationship tabs are left aligned for scrolling and retain their icons. |
| Facts, settings, and member lists | `components/ui/card.tsx`, `components/tournaments/tournament-overview.tsx`, `components/tournaments/tournament-leaderboard.tsx` | White cards, warm dividers, muted labels, neutral row highlighting and indigo selection |
| Stage status and setup progress | `components/tournaments/tournament-schedule.tsx`, `components/ui/progress.tsx`, `components/quiz/quiz-results.tsx` | Warm stage dividers, muted current row, dark primary fill on the modal’s 8 px progress track, QuizHub green for completed checks and the requested gauge |
| Chat | `components/chat/chat-message.tsx` | Muted incoming and dark primary outgoing bubbles, 16 px horizontal padding, 10 px vertical padding, rounded 16 px corners with the sender-side upper corner squared |

The record headers, in-line role colors, semicircular stage gauge, review annotation markers, and paired Aspect response treatment are scoped design exceptions. Aspect row surfaces and dividers follow the shared card tokens. The existing paired tracks are an interpretation of the supplied reference, with exact Figma measurements still unverified.

### Shared v2.0 Record Hero

Relationship Template, My Template, and My Relationship share the fallback artwork and resolve color from `lib/relationship-art.ts`. Template heroes use a blue-led color treatment with a restrained realm-ink mix and light text. Home uses cobalt `#234487` as its base. My Relationship uses a soft, flat realm tone, a muted leading rule, and dark text. The Home relationship hero uses pale slate `#EDF1F6` and slate `#4D6279`. Resolve fallback artwork through QuizHub’s `media.placeholder` entry in `data/media.ts`, backed by `public/placeholder.svg`. Blend the artwork into the flat surface with soft-light at 24% opacity on templates and 12% on My Relationship. The standalone spec embeds the SVG to work offline. The baseline remains the historical comparison.

Reserve the artwork slot for future personalization. A missing or unusable personal asset resolves to the same SVG. Personalization should preserve the realm tone, foreground readability, and layout. Keep record types recognizable through their explicit labels, layout, and actions.

## Record Types and Action Order

| Surface | Identity | First action | Supporting content |
| --- | --- | --- | --- |
| Relationship Template | Explicit **RELATIONSHIP TEMPLATE** identifier on a cobalt band | Value proposition and **Create Relationship** before metadata. Start free and introduce plan options at the appropriate step. | Template roles, reusable Aspects, setup options, and secondary template facts |
| My Template | **MY TEMPLATE** identifier with the shared template treatment | Start from the owned copy | Owned-template source and the same Aspect preview |
| My Relationship | Explicit **MY RELATIONSHIP** identifier in the TournamentHeader layout | Next available task for the member’s role and the relationship’s current state | Parties, settings, billing access, session Aspects, and session records |

Keep a template's conversion card above facts in reading order. Give the proposal and owned template a taller hero, with the identity label and taxonomy in the same responsive row as My Relationship. Keep the source template copy and draft CTA distinct from member instance status. Use the [Science Showdown](http://localhost:3001/tournaments/science-showdown) participant page as the My Relationship page pattern. Keep the header, tab strip, tab content, and overview grid in that order. Put core actions beneath the hero description and the compact party cards in a white row between the hero and tabs. Put relationship stage progress and state metrics in a persistent right sidebar outside every tab panel. The progress sidebar and tab panels sit side by side once their 272 px and 420 px bases plus the 16 px gap fit. On narrower layouts, the sidebar stacks below the panel. Use the same full-width scrolling Tabs and the same responsive two-thirds/one-third Card grid. Keep the tab strip left aligned with a contextual icon before each title. The tabs are Discussion, Aspects, Members, Details, Settings, and role-gated Payment, with Discussion selected on load.

| Source pattern | My Relationship mapping |
| --- | --- |
| `components/tournaments/tournament-header.tsx` | Keep the shared hero background and action placement. Place compact party cards in the white strip above the tabs. |
| `components/tournaments/tournament-detail.tsx` and `components/ui/tabs.tsx` | Keep the continuous tab strip, active styling, and keyboard behavior. Change the tab values and labels to the relationship domain. |
| `components/tournaments/tournament-overview.tsx` and `components/ui/card.tsx` | Keep full-width Cards with the shared header and content slots. Use the main column for member tasks and records and the narrow column for related facts. |

Use one untitled Stage Status card in the persistent right sidebar. Follow the profile reference for the semicircular meter and QuizHub’s tournament schedule for bordered, structured rows. The meter measures the five setup stages and displays **STAGE X** with the current stage name. Use green for completed setup and a muted fill for the current row. Align remains ongoing after setup reaches 100%. Show saved Relationship Settings in Settings only.

Use the comments section of `components/news/news-article.tsx` for Discussion. Put the composer above the comment list and show an avatar, author, timestamp, thumb count, and Reply on each post. The sort selector offers Newest, Oldest, and Most Liked. Likes toggle on comments and replies, and replies open under their parent. Preview interactions last until reload. The live implementation must scope reading and posting to authorized relationship members.

Use `components/tournaments/tournament-leaderboard.tsx` for the full-width Members card and participant table, mapped to Member, Role, and Status. Keep scores and ranks out of the relationship table. Use `components/tournaments/tournament-schedule.tsx` for the inline Aspect cards. Show the question, both scale endpoints, and both parties’ recorded values with read-only neutral rails and fills in green for the initiator and blue for the counterparty. Use the supplied Figma reference for the completed Aspect disclosure rows. Within each open Aspect, place a centered opinion prompt above paired You and Them tracks and print the source endpoints under each pair. Keep full names and numeric values available to assistive technology. Reuse the same assessment rows in the dashboard and the modal’s Review Answers panel. Render two opinion columns when space allows and one on narrow screens. Basic displays Feel and Wish. Advanced also displays Think and Guess. Always display numeric values and endpoint text independently of color. The prototype uses fictional answers. Production must use the latest completed round the viewer is authorized to read, enforce the existing sharing gates, and show an empty state when no completed round is available.

The standalone preview embeds the relevant utilities compiled from the project’s Tailwind config and mirrors the source component markup. The Next.js implementation should compose the project’s actual Tabs, Card, and Button components. Keep relationship-specific cards and settings inside the existing slots.

Party cards show the uppercase membership role, the person's bold full name in dark text, and the muted template seat label. Use amber `#8A4900` for Initiator and blue `#124FAC` for Counterparty. Place both chips in one row below the hero and stack them on narrow screens. Keep the Coach role out of the dashboard until its UI is implemented.

### My Relationship Actions From v1.20

The detail, list-card, and detail-copy files are identical across tags `v1.20.0` and `v1.20.1`.

| Placement | Action and availability |
| --- | --- |
| Left Hero Actions | **Open Assessment** when an accessible session exists. **Edit Relationship** when the existing edit permission allows it. **Publish to Counterparty** for an eligible initiator, preserving the Stage 5 handoff and membership gate. **Complete and Open the Gap** when the server confirms completion is available and both sheets are sealed. |
| Aspects | Edit, reorder, add, remove, save draft, and mark ready only in eligible prepublication states. Use the existing Aspect editor and keep the published list read-only. |
| Members | **Invite Members**, **Reissue the Link**, or the newly issued invitation link when the source state and permissions allow each. Copy remains unavailable when the original token cannot be retrieved. |
| Details | Relationship metadata and session records. Show **Save This Template to My Templates** and its success link only when the source allows forking. **View Relationship** is the list's route into this surface. |
| Settings | Relationship configuration only. Move subscription and payment handoffs to Payment. Keep the source archive action unavailable until the app supports it. |

The standalone mock shows the active initiator state. The other actions use the app's existing role and lifecycle predicates when wired.

## Shared Relationship Flow Modal

Use the QuizHub play and results patterns from `components/quiz/quiz-play.tsx` and `components/quiz/quiz-results.tsx` for a persistent progress header, discreet transitions, completion summary, and expandable answer review. Label each setup screen **STAGE X OF 5 · Name** and respect reduced-motion preferences. Keep the quiz’s numeric score out of relationship analysis.

Create and resume share one sample draft. The five-stage setup follows `docs/specs/flow-stages.md` and returns to My Relationship after Invite. Open Assessment opens a separate Align review. Back and Continue move one stage at a time. Closing returns focus to the launch control.

| Wizard surface | Source and standalone behavior |
| --- | --- |
| Shell | `components/quiz/quiz-play.tsx` and `components/ui/progress.tsx` supply the progress treatment and directional entry. The stage rail follows `components/assessment-flow/wizard-steps.tsx`. The modal caps at 880 px and becomes a full-height sheet below 560 px. |
| Details | Follow the production field order, with title, both name pairs, invitation email, and optional description. The title follows the names until edited. |
| Settings | Reuse the two Mode and Setting fieldsets and one footer. |
| Aspects | Use `components/assessment-flow/aspect-list.tsx` for every editable Aspect surface. The standalone Stage 3 editor mirrors its numbered rows, grip, endpoints, edit and remove controls. Editing replaces the row with the question and endpoint form. Save commits and Cancel discards. Reorder by dragging the grip or pressing Up and Down while it has focus. The Template Proposal keeps its read-only disclosure. Completed assessment results keep their response disclosure. |
| Account | Follow the column layout and panel order of `components/assessment-flow/account-panel.tsx` and `components/auth/register-view.tsx`. Preview Sign Up and Sign In fade within the left column. Continue advances immediately using a sample account. |
| Invite | Follow `components/assessment-flow/invite-walk.tsx` with Basic or Principal selection, a sample payment confirmation, and invitation preview or Keep Draft. |


The standalone demo retains setup changes only for the open browser session. No accounts, invitations, or assessment submissions are sent. Live flows must resume the authorized, server-backed draft, validate stage transitions and invitations, and limit completed answer review to the last round the viewer is authorized to read.

## Chat Workspace

Use QuizHub’s `components/chat/chat-page.tsx`, sidebar, message bubbles, and composer as the reference. The dashboard Chat entry opens the current member’s searchable connection list. Direct messages and relationship conversations have separate histories and drafts. Relationship Discussion and joined member details link to the relationship-scoped conversation.

The standalone prototype uses Irene’s sample connections and local messages. Live Chat should scope direct conversations to permitted participants and relationship threads to current authorized members. Check access server-side for viewing, posting, and subscriptions to updates. Keep Discussion as the existing relationship post surface.

## Member Details and Invitations

Open a member detail dialog from the roster row or its accessible button. Show the member’s party role and a prominent joined state. Distinguish sent, invite link opened, signed in or signed up through the invitation, joined, expired, and removed. Link open telemetry is an engagement signal, not confirmation that a recipient read the email. Show event timestamps only when recorded.

The initiator can resend or reinvite with a default or custom message when the counterparty has not joined, and can remove the counterparty after confirmation when modifications are allowed. The joined counterparty can request their own removal without losing access until the request is acted on. Reinvites and removals use the live server’s token invalidation, access checks, and audit trail. **Message in Discussion** opens the existing composer for joined participants. The standalone scenario selector and actions update preview state only. No invitations or removal requests are sent.

## Relationship Details

Show the initiator-entered name and description as read-only information by default for all authorized roles. Keep the party names, taxonomy, source template, and lifecycle dates in Details. Put **Edit Relationship** and its modal here.

Only the Initiator can edit a draft or a published relationship covered by an active plan. A scheduled cancellation or completed relationship locks editing immediately. The requested billing rule ends recurring charges after the current cycle when the relationship is completed or cancellation has been scheduled. For live use, enforce the edit gate server-side and reconcile the provider-confirmed effective date and entitlement. Scope the billing change to the applicable subscription so unrelated coverage is preserved. The prototype’s **Role and Stage Preview** exposes lifecycle and plan scenarios without changing live records or billing.

## Payment

- Show the relationship’s Payment tab for its Initiator and authorized Admins. Resolve access and billing ownership on the server. An Admin can review permitted status and audit context. Only the authenticated billing owner may open a customer portal session for their own Stripe customer.
- Add **Payment** to the profile dropdown, linking to the proposed aggregate account surface at `/dashboard/payment`. List the account’s subscriptions and coverage, status, renewal or end date when available, and a billing management entry.
- The app has Stripe Checkout and subscription and invoice webhook handling. Customer Portal session creation is new wiring. Use Stripe-hosted options for payment method and billing details, invoice history and downloads, and eligible plan changes or cancellation. Show the functions enabled by the configured portal and the subscription state. Do not expose card details, provider identifiers, or another customer’s invoice data.
- The standalone spec uses sample billing data and local navigation. Its role visibility illustrates the intended UI and does not implement authorization.

[Stripe Customer Portal configuration](https://docs.stripe.com/api/customer_portal/configurations/create)

The relationship tab is titled **Relationship Initiator Membership**. Put owner, coverage, current status, and next renewal or effective end date first. Show a chronological history of permitted invoice and entitlement events with date, activity, and status. The admin view is read-only and can show authorized entitlement and provider sync context. Customer billing actions, invoice downloads, payment details, and portal entry belong to the billing owner. Show empty, trial, past-due, or ending states from the subscription projection when relevant. Stripe webhooks reconcile status and access after a billing change. Use the shared **Role and Stage Preview** to switch billing presentations. Initiators see billing actions, admins see the read-only view, and other roles have no Payment tab. If Payment is selected when the role loses access, fall back to Discussion.

Use a short-lived portal session created server-side for the authenticated billing owner’s customer ID, with return navigation to Account Payment. Treat portal actions as conditional on the configured features and subscription state. Keep the standalone controls illustrative. [Stripe Customer Portal](https://docs.stripe.com/customer-management)

## Relationship Settings

Use Stage 2’s `components/assessment-flow/stage-choice-form.tsx` and `ChoiceFieldset` structure as the shared base. Opinions Mode and Alignment Setting are peer groups, with option descriptions and a visible selected state. Stack the groups when the component is narrow.

| Context | Presentation |
| --- | --- |
| Template details, a locked published or completed round, or a demo | Render as non-form content. Show saved selections where available. |
| Eligible editable draft with an explicit server grant | Use native radio groups. An Initiator can edit eligible relationship drafts. A Template Editor can edit eligible template drafts. Admin edits require the applicable server grant and editable lifecycle state. |
| Draft on a management surface without edit permission | Show disabled controls with a reason. This includes a Counterparty without edit permission. |
| Stage 2 create flow | Use the same editable groups with the existing Stage 2 validation and Continue action. |

Open **Role and Stage Preview** from the shared Spec Views navigation. The modal holds role, record type, lifecycle status, workflow stage, and edit permission. Changes update the actual Mode and Setting component in the Settings tab, the persistent Stage Status sidebar, and the role-gated Payment tab. Keep the workflow stage and record lifecycle status separate so each can be tested. The modal’s **View Settings** action selects the tab directly. They do not grant access, persist changes, or change published settings. The live app enforces permissions and immutable round settings on the server.

## Template Identity and Version

Keep the surface label, template title, relationship type, group, realm, and version distinct. In the example, **Relationship Template** names the surface, **Brother A–Brother B** is the title, **Brothers** is the taxonomy short name for the relationship type, **Personal** is the group, and **Home** is the realm.

Display the immutable published snapshot’s integer `template_version.version` and its two-digit publication year as `vN.YY`. For example, version 1 published in 2026 displays as **v1.26**. Format the selected snapshot’s version and year independently, without treating the label as a decimal or using the current year. The HTML displays **v1.26** as sample metadata. The label is separate from the taxonomy chips and from the app release number.

## Data and Interaction Contract

| UI group | Source and treatment |
| --- | --- |
| Template identity and Aspects | The assessment `record`, its Aspect children and versions. Resolve labels and prompt text from the record. The sample uses `assessment-brothers` in `data/bundles/demo-dataset.alignsynch.json`. |
| Relationship identity and state | Use the member-scoped dashboard projection. Display the user-entered relationship name and description independently, with the source template title or summary as the fallback for each empty field. In v1.20 the detail heading resolves `relationshipTitle ?? title` and the record body uses `summary`. Preserve the source template identity in Details. |
| Parties and membership | `relationship_member.role` supports Initiator, Counterparty, and Coach. Render seats from membership data and identify the current viewer. Display Initiator and Counterparty in the current dashboard. Add Coach when its UI is implemented. The relationship's derived membership controls its status treatment. |
| Settings | Read Mode and Setting from the applicable session or setup draft. Basic uses Feel and Wish. Advanced also uses Think and Guess. Use the record's saved settings for a published session. |
| Session records and Aspect children | Show the session round and its saved Aspect order and endpoints. Render permission-aware links to available work. The static demo uses the same Brothers prompts as sample session data. |
| Payment | Use the server's relationship membership and `relationship_payment` projection to determine which actions the current member can take. Keep provider IDs, payment-method IDs, and private details out of the UI. |
| Aspect preview and editor | Reuse the ordered row and question/endpoint model from `components/assessment-flow/aspect-list.tsx`. Use the same inline Aspect disclosure on template pages and My Relationship. Template details show opinion prompts, scale ticks, and endpoint labels. Completed rounds add paired response tracks. On My Relationship, show the latest completed, shareable round inline without a modal. Editing belongs to the existing permission-aware dashboard or Stage 3 wizard flow. |
| Creation | Begin at **Details** with the selected template. Continue through Settings, Aspects, Account, and Invite. Align is available on My Relationship. |

## Source References

- `app/globals.css` and `data/brands/alignsynch.ts` for global and brand tokens.
- `components/layout/main-layout.tsx`, `sidebar.tsx`, and `header.tsx` for the dashboard frame.
- `components/assessment-flow/record-detail-shell.tsx`, `components/assessment-flow/aspect-list.tsx`, and `components/dashboard/relationship-detail.tsx` for existing structure, permissions, and settings.
- `db/migrations/0001_content_model.sql`, `0013_relationship_sessions.sql`, `0014_relationship_membership.sql`, `0026_template_version.sql`, `0030_relationship_lifecycle.sql`, `0031_session_round.sql`, `0036_relationship_payment.sql`, and `0039_session_aspects_authored_at.sql` for the data model.
