---
title: Email Templates
summary: Fix the words an email sends without waiting for a deploy.
audience: [Admin]
status: Built (#1167) · design deltas open (https://github.com/riolabs-ai/alignsynch/issues/1231, https://github.com/riolabs-ai/alignsynch/pull/1242)
sources:
  - "bundle: spec-design-v2-rc1.3-bundle/09-admin-email-templates-1231/ (label spec, no render)"
  - "issues: #1138, #1231"
  - "code: main @ 601ce26"
---
# Email Templates

Every email AlignSynch sends has a code default. **Email Templates** lists them all, and lets an admin write an override for the subject, preheader and body, preview it with sample data, and publish it. Nothing goes live until you publish, and you can always see the default.

## At a Glance

| | |
|---|---|
| **Where** | Admin rail › **Email Templates** · `/admin/email-templates` |
| **Who** | Admin seats only (not Support) |
| **The register** | Template · Class · Recipient · Status · Last Edited |
| **Statuses** | Default · Draft · Published (icon plus word) |
| **The override** | Subject, Preheader, Body, and the facts a body may use |

## How It Works

1. Open **Email Templates** and pick a template from the register.
2. Write the override. The chips list the facts that body may say.
3. Check **Preview** (sample data, never a member's link).
4. Save as Draft, then Publish.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `app/(mainlayout)/admin/email-templates/page.tsx:48` | "await requireAdmin({ next: ADMIN_EMAIL_TEMPLATES_PATH });" | Admin gate. |
| `data/pages/admin-email-templates.ts:33` | "heading: "The register"," | Sentence-case heading. |
| `data/pages/admin-email-templates.ts:43` | "{ id: "edited", label: "Last edited" }," | Title Case needed: Last Edited. |
| `data/pages/admin-email-templates.ts:67` | "{ id: "both", label: "Either seat" }," | Recipient words. |
| `data/nav-menu.json:64` | ""id": "admin-email-templates"," | Rail row; `needs: admin`. |

**Open deltas:** status as icon plus word and Title Case labels ([#1231](https://github.com/riolabs-ai/alignsynch/issues/1231), [PR #1242](https://github.com/riolabs-ai/alignsynch/pull/1242) open).

## References

No shot exists in any tier for this page. Capture the built page at 1280 and 390.
