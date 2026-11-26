---
title: Who Sees the Admin Rail
summary: Which seats see which staff tools, and what everyone else gets.
audience: [Admin]
status: "Built (#1157, #1167, nav-menu.json)"
sources:
  - "code: main @ 601ce26 (data/nav-menu.json)"
  - "issues: #1126, #1138"
---
# Who Sees the Admin Rail

The Admin rail group holds the staff tools. Members never see it, and a member who types an admin address gets a plain 404, so nothing reveals that the page exists.

## At a Glance

| Seat | Sees |
|---|---|
| **Member** | No admin rows. Admin URLs answer 404 |
| **Support** | No CRUD & Permissions or Email Templates rows: both need Admin |
| **Admin** | The full Admin group: … Docs, **CRUD & Permissions**, **Email Templates**, Audit log |
| **Owner** | Everything an Admin sees |
| **Signed out** | Sent to sign in first |

## How It Works

Each rail row names the lowest seat that may see it (`needs`). The ladder is Member → Support → Admin → Owner, so an Owner always sees what an Admin sees. Each admin page checks the product first and then the seat.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `content/role-ladder.ts:21` | "export const USER_ROLES = ["member", "support", "admin", "owner"] as const;" | The seat ladder. |
| `data/nav-menu.json:57` | ""id": "admin-permissions"," | CRUD & Permissions row (`needs: admin`, icon `review`). |
| `data/nav-menu.json:64` | ""id": "admin-email-templates"," | Email Templates row (`needs: admin`). |
| `app/(mainlayout)/admin/permissions/page.tsx:68` | "requireAdminProduct();" | Product gate first, then role. |
| `data/pages/shell.ts:364` | "{ id: "admin-permissions", label: "CRUD & Permissions" }," | Rail label. |

**Open deltas:** bundle 12 specifies icon `dashboard` for CRUD & Permissions; main uses `review`. Audit log label is sentence case.

## References

No shot: no render of the rail by seat exists. The CRUD page shots show the Admin rail at the Admin seat only.
