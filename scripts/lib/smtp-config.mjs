export class SmtpConfigurationError extends Error {
  constructor(variable) {
    super(`Проверьте ${variable} в .env.smtp.local`);
    this.name = "SmtpConfigurationError";
  }
}

function required(env, name) {
  const value = env[name];
  if (!value?.trim() || /replace_me|your[-_]|<[^>]+>/i.test(value)) {
    throw new SmtpConfigurationError(name);
  }
  return value;
}

export function email(value, name) {
  if (!value || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value)) {
    throw new SmtpConfigurationError(name);
  }
  return value;
}

export function smtpConfig(env) {
  const host = required(env, "SMTP_HOST").trim();
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(host)) throw new SmtpConfigurationError("SMTP_HOST");
  const rawPort = required(env, "SMTP_PORT");
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new SmtpConfigurationError("SMTP_PORT");
  }
  const fromName = env.SMTP_FROM_NAME?.trim() || "Nexora";
  if (/[\r\n\0]/.test(fromName)) throw new SmtpConfigurationError("SMTP_FROM_NAME");
  const fromEmail = email(env.SMTP_FROM_EMAIL, "SMTP_FROM_EMAIL");
  const user = required(env, "SMTP_USER");
  if (host.toLowerCase() === "smtp.gmail.com" && user.toLowerCase() !== fromEmail.toLowerCase()) {
    throw new SmtpConfigurationError("SMTP_FROM_EMAIL");
  }
  return {
    host, port: Number(rawPort),
    user,
    pass: required(env, "SMTP_PASS"),
    fromEmail,
    fromName,
  };
}

export function managementConfig(env) {
  const projectRef = required(env, "SUPABASE_PROJECT_REF");
  if (!/^[a-z]{20}$/.test(projectRef)) throw new SmtpConfigurationError("SUPABASE_PROJECT_REF");
  return { projectRef, accessToken: required(env, "SUPABASE_ACCESS_TOKEN") };
}

export function authSmtpPayload(config) {
  return {
    external_email_enabled: true,
    mailer_secure_email_change_enabled: true,
    mailer_autoconfirm: true,
    smtp_host: config.host,
    smtp_port: config.port,
    smtp_user: config.user,
    smtp_pass: config.pass,
    smtp_admin_email: config.fromEmail,
    smtp_sender_name: config.fromName,
  };
}

export function matchesAuthConfig(actual, expected) {
  return actual.smtp_host === expected.smtp_host &&
    Number(actual.smtp_port) === expected.smtp_port &&
    actual.smtp_user === expected.smtp_user &&
    actual.smtp_admin_email === expected.smtp_admin_email &&
    actual.smtp_sender_name === expected.smtp_sender_name &&
    actual.external_email_enabled === true && actual.mailer_autoconfirm === true &&
    actual.mailer_secure_email_change_enabled === true;
  // Supabase may redact smtp_pass in readbacks; never log or compare it here.
}
