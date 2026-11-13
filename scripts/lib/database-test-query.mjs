/** A remote test must always roll back; pending migrations stay inside that transaction. */
export function prepareDatabaseTest(sql, migrations = []) {
  const statements = sql.replace(/^\s*--.*$/gm, "").trim();
  if (!/^begin;/i.test(statements) || !/rollback;\s*$/i.test(statements) || /\bcommit\s*;/i.test(statements))
    throw new Error("Тест БД должен начинаться BEGIN и заканчиваться ROLLBACK без COMMIT");
  for (const migration of migrations)
    if (/\b(?:begin|commit|rollback)\s*;/i.test(migration.replace(/^\s*--.*$/gm, "")))
      throw new Error("Миграция содержит управление транзакцией");
  const footer = "select tap from pg_temp.nexora_tap order by seq;\nselect * from extensions.finish();";
  const normalized = sql.replace(/\r\n/g, "\n");
  if (!normalized.includes(footer)) throw new Error("Не найден итоговый отчёт pgTAP");
  return normalized.replace(/\bbegin;/i, () => `begin;\nset local statement_timeout = '30s';\n${migrations.join("\n")}\n`)
    .replace(footer, "select count(*)::integer as assertions, count(*) filter(where tap like 'not ok%')::integer as failures from pg_temp.nexora_tap;");
}
