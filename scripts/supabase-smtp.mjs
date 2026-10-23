import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { smtpConfig, managementConfig, authSmtpPayload, matchesAuthConfig, email, SmtpConfigurationError } from "./lib/smtp-config.mjs";

class OperationError extends Error {}

async function main() {
  if (existsSync(resolve(".env.smtp.local"))) process.loadEnvFile(resolve(".env.smtp.local"));
  const [mode, ...extra] = process.argv.slice(2);
  if (extra.length || !["--check", "--apply", "--send-test"].includes(mode)) {
    throw new OperationError("Используйте --check, --apply или --send-test");
  }
  const smtp = smtpConfig(process.env);
  const management = managementConfig(process.env);
  // Validate the recipient before opening any connections; sending is opt-in.
  const recipient = mode === "--send-test" ? email(process.env.SMTP_TEST_TO, "SMTP_TEST_TO") : null;
  const expected = authSmtpPayload(smtp);
  const endpoint = `https://api.supabase.com/v1/projects/${management.projectRef}/config/auth`;
  const managementHeaders = { Authorization: `Bearer ${management.accessToken}`, "Content-Type": "application/json" };

  async function request(method, body) {
    let response;
    try {
      response = await fetch(endpoint, {
        method, headers: managementHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new OperationError("Не удалось связаться с Supabase Management API");
    }
    if (!response.ok) throw new OperationError(`Supabase Management API: HTTP ${response.status}`);
    // Never print the response body: it can contain operational credentials.
    return response.json();
  }

  const transport = nodemailer.createTransport({
    host: smtp.host, port: smtp.port,
    secure: smtp.port === 465,
    requireTLS: smtp.port !== 465,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    logger: false, debug: false,
  });
  try {
    try { await transport.verify(); } catch {
      throw new OperationError("SMTP: не удалось проверить TLS-соединение и учетные данные");
    }
    if (mode === "--apply") await request("PATCH", expected);
    const actual = await request("GET");
    if (!matchesAuthConfig(actual, expected)) {
      throw new OperationError("Настройки SMTP в Supabase отличаются от локальных. Выполните smtp:configure");
    }
    if (recipient) {
      const checkId = randomUUID();
      let info;
      try {
        info = await transport.sendMail({
          from: { name: smtp.fromName, address: smtp.fromEmail },
          to: recipient,
          subject: "Nexora — проверка SMTP",
          text: `Проверка SMTP Nexora. Идентификатор: ${checkId}.\nПисьмо не содержит паролей или ссылок для входа.`,
        });
      } catch {
        throw new OperationError("SMTP: провайдер не принял проверочное письмо");
      }
      if (!info.accepted?.length || info.rejected?.length) throw new OperationError("SMTP: получатель отклонен");
      console.log(`Провайдер принял одно проверочное письмо. Проверка: ${checkId}. Подтвердите получение во входящих/спаме.`);
    } else {
      console.log(mode === "--apply"
        ? "SMTP применен в Supabase. TLS, авторизация и чтение настроек проверены. Письма не отправлялись."
        : "SMTP: TLS, авторизация и совпадение настроек Supabase проверены. Письма не отправлялись.");
    }
  } finally {
    transport.close();
  }
}

main().catch((error) => {
  console.error(error instanceof OperationError || error instanceof SmtpConfigurationError
    ? error.message : "Операция SMTP не завершена. Проверьте подключение и настройки.");
  process.exitCode = 1;
});
