-- 0046_setting.sql — the non-secret configuration an admin may change without a deploy (#1443 D6-B).
--
-- `setting` is the *only* row an admin writes on `/admin/settings`, and the whole reason the surface
-- shipped read-only in v1 is that a write path over a table of names and sources is easy to widen by
-- accident. So the boundary is drawn in the schema as well as in the code, in four statements:
--
--  1. **The key is one of the governed set, by name.** The CHECK below is an allow-list, not a
--     naming convention: a `vault`-sourced secret (`RESEND_API_KEY`, `DATABASE_URL`,
--     `NEON_AUTH_BASE_URL`, …) is not a spelling that can be stored here, so an INSERT that somehow
--     reached the database with one is refused by PostgreSQL rather than by a caller's memory of the
--     rule. Adding a key is a migration — deliberately slower than adding a field to a form.
--  2. **The two switches a runtime override cannot honour are absent.** `NAV_SOURCE` is read at
--     build time and inlined into both bundles (`lib/nav-menu.ts`, `next.config.mjs`), and
--     `DEMO_ALLOW_PRODUCTION` is read once at process start (`instrumentation.ts`). A row for either
--     would be a value the form could set and nothing could obey, which is the one outcome the
--     surface exists to prevent — so they are drawn as refused rows in the form, with their reason,
--     and the database has no place to put them.
--  3. **The value is a string, never an object.** Every governed key in v1 is a count or a single
--     token (`5`, `72`, `onboarding@resend.dev`, a URL), and the two count keys are parsed by the
--     readers that already exist. A jsonb object would let a caller store a structure nothing reads
--     and nothing validates; a string keeps the value's shape equal to the env variable's.
--  4. **Every row names who wrote it and when.** `updated_by` is the `user_profile` id the session
--     resolved; `admin_action` carries the same actor beside `before` and `after`, so the audit row
--     and the row it describes cannot disagree about who moved it.
--
-- **There is no default value and no seeded row.** An empty table means "the deployment variable or
-- the code default answers", which is exactly `env > setting > default` with nothing stored; a
-- seeded row would turn a code default into a database fact and make the second reading of the
-- precedence indistinguishable from the third.
--
-- Nothing here is read at build time: `pnpm build` passes with `DATABASE_URL` unset, and
-- `lib/admin/settings/values.ts` treats an unmigrated database (`42P01`) as "no stored setting"
-- rather than as a failure, so a deploy that runs before this migration degrades to env > default
-- and says so instead of 500ing every email.
CREATE TABLE IF NOT EXISTS setting (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT        NOT NULL,

  CONSTRAINT setting_key_governed CHECK (
    key IN (
      'PLATFORM_HEALTH_DRIFT_LIMIT',
      'PLATFORM_HEALTH_FRESHNESS_HOURS',
      'RESEND_FROM',
      'RESEND_ENDPOINT'
    )
  ),
  CONSTRAINT setting_value_is_a_string CHECK (jsonb_typeof(value) = 'string'),
  CONSTRAINT setting_updated_by_present CHECK (length(btrim(updated_by)) > 0)
);

-- The surface reads the whole table once per request (six keys at most), so a primary key is the
-- only index it needs; there is no query by `updated_by` and none by date. The audit log is where
-- "who changed what, when" is answered as a history — this table answers it for the current value.
COMMENT ON TABLE setting IS
  'Governed non-secret configuration (#1443 D6-B). Read as env > setting > default by lib/admin/settings/values.ts; written only through act() with action setting.update. Never holds a vault-sourced secret — the key allow-list is the refusal.';
COMMENT ON COLUMN setting.key IS
  'The environment variable the stored value overrides. One of the four governed keys the CHECK names; adding a key is a migration.';
COMMENT ON COLUMN setting.value IS
  'The stored override, as a JSON string. A row means "this value wins over the code default and loses to the deployment environment". Absent means nothing is stored.';
COMMENT ON COLUMN setting.updated_by IS
  'The user_profile id of the actor the session resolved. admin_action carries the same actor with before and after.';
