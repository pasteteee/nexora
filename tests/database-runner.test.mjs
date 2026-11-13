import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareDatabaseTest } from "../scripts/lib/database-test-query.mjs";

const suite = "-- rollback-only fixture\nbegin;\nselect tap from pg_temp.nexora_tap order by seq;\nselect * from extensions.finish();\nrollback;";
test("remote DB runner preserves the rollback and embeds migrations after BEGIN", () => {
  const result = prepareDatabaseTest(suite, ["alter table example add column extra text;"]);
  assert.ok(result.indexOf("begin;") < result.indexOf("alter table"));
  assert.ok(result.trim().endsWith("rollback;"));
  assert.ok(result.includes("as assertions"));
});
test("remote DB runner rejects suites or migrations that could commit", () => {
  assert.throws(() => prepareDatabaseTest(suite.replace("rollback;", "commit;")));
  assert.throws(() => prepareDatabaseTest(suite, ["commit;"]));
  assert.throws(() => prepareDatabaseTest(suite.replace("begin;", "")));
});
test("remote DB runner preserves PostgreSQL dollar quotes verbatim", () => {
  const migration = "create function example() returns text language sql as $$ select '$&' $$;";
  assert.ok(prepareDatabaseTest(suite, [migration]).includes(migration));
});
