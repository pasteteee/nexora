import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";

// Native dotenv loading leaves $ in SMTP passwords intact. No values are logged.
for (const file of [".env.production.local", ".env.local", ".env.smtp.local"]) {
  if (existsSync(resolve(file))) process.loadEnvFile(resolve(file));
}
const privateNames = ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ACCESS_TOKEN", "SMTP_PASS", "AI_API_KEY", "OPENAI_API_KEY"];
const privateValues = privateNames.map((name) => [name, process.env[name]])
  .filter(([, value]) => value && value.length >= 8);
const staticRoot = resolve(".next/static");
if (!existsSync(staticRoot)) {
  console.error("Сначала выполните npm run build: каталог .next/static отсутствует.");
  process.exit(1);
}

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}

const outputs = await files(staticRoot);
const appRoot = resolve(".next/server/app");
if (existsSync(appRoot)) outputs.push(...(await files(appRoot)).filter((path) => /\.(html|rsc|txt)$/.test(path)));
const findings = [];
for (const file of outputs) {
  const text = await readFile(file, "utf8");
  const exposed = privateValues.filter(([, value]) => text.includes(value)).map(([name]) => name);
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(text)) exposed.push("Supabase secret key");
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split(".")[1], "base64url").toString());
      if (payload.role === "service_role") exposed.push("service_role JWT");
    } catch { /* Non-JWT text cannot authorize database access. */ }
  }
  if (exposed.length) findings.push(`${relative(process.cwd(), file)}: ${[...new Set(exposed)].join(", ")}`);
}
if (findings.length) {
  console.error(`В публичных артефактах найдены секреты (значения скрыты):\n${findings.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Проверено ${outputs.length} публичных файлов: секреты и service_role не обнаружены.`);
}
