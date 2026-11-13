import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { managementConfig } from "./lib/smtp-config.mjs";
import { prepareDatabaseTest } from "./lib/database-test-query.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--remote-rollback") || args.some(x => !["--remote-rollback", "--include-pending"].includes(x)))
    throw new Error("Используйте --remote-rollback [--include-pending]. Все изменения откатываются.");
  if (existsSync(".env.smtp.local")) process.loadEnvFile(".env.smtp.local");
  const management = managementConfig(process.env);
  const endpoint = `https://api.supabase.com/v1/projects/${management.projectRef}/database/query`;
  const privateValues = ["SUPABASE_ACCESS_TOKEN", "SMTP_PASS", "SUPABASE_SECRET_KEY"].map(k => process.env[k]).filter(v => v?.length >= 8);
  function safe(message) {
    for (const value of privateValues) message = message.replaceAll(value, "[redacted]");
    return message.replace(/(?:sbp_|sb_secret_)[\w-]+/g, "[redacted]").slice(0, 4000);
  }
  async function query(sql, readOnly = false) {
    const response = await fetch(endpoint, {
      method: "POST", headers: { Authorization: `Bearer ${management.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql, read_only: readOnly }), signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      // Server SQL diagnostics only; redact known credentials before printing anything.
      throw new Error(`Database API HTTP ${response.status}: ${safe(await response.text())}`);
    }
    return response.json();
  }
  const versionsSql = "select version from supabase_migrations.schema_migrations order by version";
  const fixtureSql = "select count(*)::integer as users from auth.users where email like 'nexora-rls-%@example.test' or email like 'nexora-qa-%@example.test'";
  const beforeVersions = await query(versionsSql, true);
  const beforeFixtures = await query(fixtureSql, true);
  const applied = new Set(beforeVersions.map(row => row.version));
  const pending = (await readdir("supabase/migrations")).filter(name => /^\d+_.+\.sql$/.test(name) && !applied.has(name.split("_")[0])).sort();
  const includePending = args.includes("--include-pending");
  const migrations = includePending ? await Promise.all(pending.map(name => readFile(`supabase/migrations/${name}`, "utf8"))) : [];
  console.log(`Проект: ${management.projectRef}. Неприменённых миграций: ${pending.length}. Режим: ROLLBACK.`);
  if (includePending) console.log("Неприменённые миграции проверяются временно, без записи в историю и без сохранения изменений.");
  const suites = (await readdir("supabase/tests")).filter(name => name.endsWith(".test.sql")).sort();
  const results = [];
  for (const name of suites) {
    try {
      const sql = prepareDatabaseTest(await readFile(`supabase/tests/${name}`, "utf8"), migrations);
      const rows = await query(sql);
      const summary = rows.find(row => typeof row.assertions === "number");
      if (!summary || summary.failures || !summary.assertions) throw new Error("Неполный либо неуспешный отчёт pgTAP");
      results.push({ file: name, ...summary });
      console.log(`${name}: ${summary.assertions} проверок, ${summary.failures} ошибок.`);
    } catch (error) {
      results.push({ file: name, error: safe(error.message) });
      console.error(`${name}: ${safe(error.message)}`);
    }
  }
  const afterVersions = await query(versionsSql, true);
  const afterFixtures = await query(fixtureSql, true);
  const rollbackVerified = JSON.stringify(beforeVersions) === JSON.stringify(afterVersions) && JSON.stringify(beforeFixtures) === JSON.stringify(afterFixtures);
  const report = { project: management.projectRef, testedAt: new Date().toISOString(), pendingMigrations: pending, pendingTestedInTransaction: includePending, results, rollbackVerified };
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/database-results.json", JSON.stringify(report, null, 2));
  console.log(`Откат данных и неизменность истории миграций: ${rollbackVerified ? "подтверждены" : "ОШИБКА"}.`);
  if (!rollbackVerified || results.some(result => result.error)) process.exitCode = 1;
}
main().catch(error => { console.error(/Проверьте SUPABASE_|Используйте/.test(error.message) ? error.message : "Не удалось выполнить тесты БД. Проверьте доступ к Management API."); process.exitCode = 1; });
