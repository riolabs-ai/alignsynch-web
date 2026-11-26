/**
 * The Settings write path (#1443 §11) — `writeSetting` against a fake transaction.
 *
 * What the card promises about this write is a property of **statement order and the actor's rung**,
 * and neither needs a database:
 *
 *   begin → `SELECT role … FOR SHARE` → `SELECT value … FOR UPDATE` → upsert (or delete) →
 *   `INSERT admin_action` → commit
 *
 * So the fake below answers those three reads and records every statement, which makes four claims
 * assertable without a connection:
 *
 *   1. an `admin` edit writes the row and the audit carries **both sides** — the row as it was and
 *      the value as it now is, read inside the transaction that changed it;
 *   2. a `support` session is refused by `act()`'s floor (`role-too-low`) and **no setting statement
 *      runs** — the refusal happens before the mutation, which is the contract `lib/admin/act.ts`
 *      states;
 *   3. a vault-sourced key never reaches a statement at all, so neither does an audit row claiming a
 *      secret was changed;
 *   4. an empty value is a **delete**, and its audit entry records `after: null` rather than an empty
 *      string — "there is nothing here" is a different fact from "the value is empty".
 *
 * `passThrough` is the seam: the fake's `query` is handed to `act()` through a runner that models a
 * transaction as BEGIN/COMMIT with no rollback path, because the rollback cases are already pinned
 * by `tests/admin-act.test.ts` on the same function.
 */
import { describe, expect, it } from "vitest";

import type { ActConnection, ActSql, ActTransactionRunner } from "@/lib/admin/act";
import { ActRefused, act } from "@/lib/admin/act";
import { RESEND_FROM } from "@/lib/admin/settings/governed";
import { SettingRefused, writeSetting } from "@/lib/admin/settings/values";

/** One recorded statement. */
interface Statement {
  readonly text: string;
  readonly values: readonly unknown[];
}

/**
 * A connection that answers the sees of this write and remembers what it was asked.
 *
 * `row` is the stored value the `SELECT … FOR UPDATE` sees — `undefined` means "no row", which is
 * the create case. `role` is the rung `act()` reads, and it is what makes a `support` refusal a real
 * one rather than a mocked `throw`.
 */
class FakeSettingSql implements ActSql {
  readonly statements: Statement[] = [];
  role: string = "admin";
  row: string | undefined;

  async query<R>(text: string, values: readonly unknown[] = []): Promise<{ rows: readonly R[] }> {
    this.statements.push({ text, values });
    const head = text.trim();

    if (/^SELECT role FROM user_profile/i.test(head)) {
      return { rows: [{ role: this.role }] as unknown as readonly R[] };
    }
    if (/^SELECT value FROM setting/i.test(head)) {
      return {
        rows: (this.row === undefined ? [] : [{ value: this.row }]) as unknown as readonly R[],
      };
    }
    if (/^INSERT INTO setting/i.test(head)) {
      // `values[1]` is the JSON-encoded value the module stored; the row is now that value.
      this.row = JSON.parse(String(values[1])) as string;
      return { rows: [{ updated_at: "2026-11-26T00:00:00Z" }] as unknown as readonly R[] };
    }
    if (/^DELETE FROM setting/i.test(head)) {
      this.row = undefined;
      return { rows: [{ updated_at: "2026-11-26T00:00:00Z" }] as unknown as readonly R[] };
    }
    if (/^INSERT INTO admin_action/i.test(head)) {
      return { rows: [{ id: "action-1" }] as unknown as readonly R[] };
    }
    return { rows: [] as unknown as readonly R[] };
  }

  /** The statements that are not the transaction's own control verbs. */
  get writes(): Statement[] {
    return this.statements.filter(
      (statement) => !/^(BEGIN|COMMIT|ROLLBACK)$/i.test(statement.text.trim()),
    );
  }

  /** The audit row as `act()` wrote it: `values[7]` is `after`. */
  get auditAfter(): unknown {
    const audit = this.statements.find((statement) =>
      /^INSERT INTO admin_action/i.test(statement.text.trim()),
    );
    return audit === undefined ? undefined : JSON.parse(String(audit.values[7]));
  }

  /** The audit row's `before`: `values[6]`. */
  get auditBefore(): unknown {
    const audit = this.statements.find((statement) =>
      /^INSERT INTO admin_action/i.test(statement.text.trim()),
    );
    return audit === undefined ? undefined : JSON.parse(String(audit.values[6]));
  }
}

/** A runner over one fake connection, modelling only BEGIN → work → COMMIT. */
function runnerOver(sql: FakeSettingSql): ActTransactionRunner {
  const connection: ActConnection = {
    query: (text, values) => sql.query(text, values),
    release: () => {},
  };
  return {
    transaction: async <T>(work: (surface: ActSql) => Promise<T>): Promise<T> => {
      await connection.query("BEGIN");
      const result = await work(connection);
      await connection.query("COMMIT");
      return result;
    },
  };
}

describe("an admin write", () => {
  it("writes the value and records both sides of the change", async () => {
    const sql = new FakeSettingSql();
    sql.row = "old@example.com";
    const result = await writeSetting(
      { actorUserId: "actor-1", key: RESEND_FROM, value: "new@example.com" },
      runnerOver(sql),
    );

    expect(result).toMatchObject({
      actionId: "action-1",
      key: RESEND_FROM,
      before: "old@example.com",
      after: "new@example.com",
    });
    expect(sql.row).toBe("new@example.com");
    expect(sql.auditBefore).toBe("old@example.com");
    expect(sql.auditAfter).toBe("new@example.com");
  });

  it("records `before: null` for a key that had no row — a create is not an empty row", async () => {
    const sql = new FakeSettingSql();
    const result = await writeSetting(
      { actorUserId: "actor-1", key: RESEND_FROM, value: "first@example.com" },
      runnerOver(sql),
    );
    expect(result.before).toBeNull();
    expect(sql.auditBefore).toBeNull();
  });

  it("carries the actor into the row it writes, so the table and the audit agree", async () => {
    const sql = new FakeSettingSql();
    await writeSetting(
      { actorUserId: "actor-9", key: RESEND_FROM, value: "a@example.com" },
      runnerOver(sql),
    );
    const upsert = sql.statements.find((statement) =>
      /^INSERT INTO setting/i.test(statement.text.trim()),
    );
    expect(upsert?.values[2]).toBe("actor-9");
    const audit = sql.statements.find((statement) =>
      /^INSERT INTO admin_action/i.test(statement.text.trim()),
    );
    expect(audit?.values[0]).toBe("actor-9");
    expect(audit?.values[2]).toBe("setting.update");
    expect(audit?.values[3]).toBe("setting");
    expect(audit?.values[4]).toBe(RESEND_FROM);
  });

  it("clears a row with a delete and an `after: null`", async () => {
    const sql = new FakeSettingSql();
    sql.row = "old@example.com";
    const result = await writeSetting(
      { actorUserId: "actor-1", key: RESEND_FROM, value: "   " },
      runnerOver(sql),
    );
    expect(result).toMatchObject({ before: "old@example.com", after: null });
    expect(sql.row).toBeUndefined();
    expect(sql.statements.some((statement) => /^DELETE FROM setting/i.test(statement.text))).toBe(
      true,
    );
    expect(sql.auditAfter).toBeNull();
  });
});

describe("a refused write", () => {
  it("refuses a support session inside the transaction, before any setting statement", async () => {
    const sql = new FakeSettingSql();
    sql.role = "support";

    await expect(
      writeSetting(
        { actorUserId: "actor-1", key: RESEND_FROM, value: "a@example.com" },
        runnerOver(sql),
      ),
    ).rejects.toBeInstanceOf(ActRefused);

    expect(
      sql.writes.some(
        (statement) =>
          /setting/i.test(statement.text) && !/SELECT role|admin_action/i.test(statement.text),
      ),
    ).toBe(false);
    expect(sql.row).toBeUndefined();
  });

  it("refuses a vault-sourced secret by name, and runs no statement at all", async () => {
    const sql = new FakeSettingSql();
    const refusal = await writeSetting(
      { actorUserId: "actor-1", key: "RESEND_API_KEY", value: "re_secret" },
      runnerOver(sql),
    ).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(SettingRefused);
    expect((refusal as SettingRefused).reason).toBe("vault-sourced");
    expect((refusal as SettingRefused).message).toContain("RESEND_API_KEY");
    expect(sql.statements).toHaveLength(0);
  });

  it("refuses a key fixed by the deployment, with the registry's reason", async () => {
    const sql = new FakeSettingSql();
    await expect(
      writeSetting(
        { actorUserId: "actor-1", key: "NAV_SOURCE", value: "derived" },
        runnerOver(sql),
      ),
    ).rejects.toMatchObject({ reason: "fixed-by-deployment" });
    expect(sql.statements).toHaveLength(0);
  });

  it("refuses a value the setting cannot accept, before the transaction opens", async () => {
    const sql = new FakeSettingSql();
    await expect(
      writeSetting(
        { actorUserId: "actor-1", key: "PLATFORM_HEALTH_DRIFT_LIMIT", value: "five" },
        runnerOver(sql),
      ),
    ).rejects.toMatchObject({ reason: "invalid-value" });
    expect(sql.statements).toHaveLength(0);
  });
});

describe("the audit contract `act()` still owns", () => {
  it("writes the audit row last, in the same transaction as the change", async () => {
    const sql = new FakeSettingSql();
    await writeSetting(
      { actorUserId: "actor-1", key: RESEND_FROM, value: "a@example.com" },
      runnerOver(sql),
    );
    const order = sql.statements.map((statement) =>
      statement.text.trim().split(/\s+/)[0]?.toUpperCase(),
    );
    expect(order[0]).toBe("BEGIN");
    expect(order.at(-1)).toBe("COMMIT");
    expect(order.indexOf("INSERT")).toBeLessThan(order.indexOf("COMMIT"));
    expect(order.lastIndexOf("SELECT")).toBeLessThan(order.findIndex((verb) => verb === "INSERT"));
  });

  it("is registered against `setting` in the audit catalogue", async () => {
    const { AUDIT_TARGET_TABLES } = await import("@/lib/admin/roles");
    expect(AUDIT_TARGET_TABLES).toContain("setting");
  });

  it("is refusable through `act()` alone, with no mutation of this module's", async () => {
    const sql = new FakeSettingSql();
    sql.role = "member";
    await expect(
      act(
        {
          actorUserId: "actor-1",
          action: "setting.update",
          target: { table: "setting", id: RESEND_FROM },
          mutate: async () => ({ before: null, after: null }),
        },
        runnerOver(sql),
      ),
    ).rejects.toMatchObject({ reason: "role-too-low" });
  });
});
