/**
 * `/admin/start`'s page module, driven with the gates and the four reads stubbed (#1374).
 *
 * The route's last mile is a session: `pnpm start` answers a session-less request with the gate's
 * 307 (proved by curl in the PR), and an admin's own session cannot be minted by a headless worker.
 * So this file drives the module itself — the real `AdminStartPage`, the real fixtures, the real
 * `StageColumn` — with `requireAdmin()` and the four reads answering as an admin's request would.
 * What it proves is the half a curl cannot: **an admin's request renders the page**, and the four
 * numbers on it are the ones the shelves returned rather than four zeroes.
 *
 * The mocks are the four reads the page names and nothing else. If the page grew a fifth query this
 * test would fail on the unmocked module rather than quietly passing, which is the property worth
 * having in a hotfix lane with a "no new query" rule.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    require("react").createElement("a", { href, ...rest }, children as unknown),
}));

const requireAdmin = vi.fn(async (_options?: unknown) => ({
  user: { userId: "user-admin", email: "admin@demo.alignsynch.test", name: "Demo Admin" },
}));
const requireAdminProduct = vi.fn(() => undefined);

vi.mock("@/lib/auth/require-role", () => ({
  requireAdmin: (options: unknown) => requireAdmin(options),
}));
vi.mock("@/lib/brand-boundary", () => ({ requireAdminProduct: () => requireAdminProduct() }));

const readInbox = vi.fn();
const listReviewArtifacts = vi.fn();
const listAdminSessions = vi.fn();
const readAuditLog = vi.fn();

vi.mock("@/lib/db/admin-inbox", () => ({ readInbox: () => readInbox() }));
vi.mock("@/lib/db/review-artifacts", () => ({ listReviewArtifacts: () => listReviewArtifacts() }));
vi.mock("@/lib/db/admin-sessions", () => ({
  listAdminSessions: (now: Date) => listAdminSessions(now),
}));
vi.mock("@/lib/db/admin-audit", () => ({
  readAuditLog: (filter: unknown) => readAuditLog(filter),
}));

import AdminStartPage from "@/app/(mainlayout)/admin/start/page";
import { adminStartPageCopy } from "@/data/pages/admin-start";

beforeEach(() => {
  vi.clearAllMocks();
  readInbox.mockResolvedValue({
    messages: [{}, {}, {}],
    seats: [{}, {}],
    hidden: 7,
  });
  listReviewArtifacts.mockResolvedValue([
    { progress: { todosDone: 2, todosTotal: 5, issuesOpen: 3, issuesClosed: 0, updatedAt: null } },
    { progress: { todosDone: 0, todosTotal: 4, issuesOpen: 1, issuesClosed: 0, updatedAt: null } },
  ]);
  listAdminSessions.mockResolvedValue([{}, {}]);
  readAuditLog.mockResolvedValue(Array.from({ length: 13 }, () => ({})));
});

describe("/admin/start — an admin's request", () => {
  it("gates on the console's pair and renders the four counts the shelves answered", async () => {
    const html = renderToStaticMarkup(await AdminStartPage());

    expect(requireAdminProduct).toHaveBeenCalledTimes(1);
    expect(requireAdmin).toHaveBeenCalledWith({ next: "/admin/start" });
    expect(html).toContain(adminStartPageCopy.heading);

    // The inbox is the newest page plus what the read withheld: 3 + 7.
    expect(html).toContain(">10</span>");
    // Open to-dos are (5-2) + (4-0); the shelf's open issues are 3 + 1.
    expect(html).toContain(">7</span>");
    expect(html).toContain(">2</span>"); // relationships
    expect(html).toContain(">13</span>"); // the audit log's newest page
    expect(html).toContain("2 artifacts · 4 issues still open.");
    // The page's own door is not on it: /admin/start links to surfaces, not to itself.
    expect(html).not.toContain('href="/admin/start"');
  });

  it("reads all four shelves, and no fifth query", async () => {
    await AdminStartPage();
    expect(readInbox).toHaveBeenCalledTimes(1);
    expect(listReviewArtifacts).toHaveBeenCalledTimes(1);
    expect(listAdminSessions).toHaveBeenCalledTimes(1);
    expect(readAuditLog).toHaveBeenCalledTimes(1);
  });
});
