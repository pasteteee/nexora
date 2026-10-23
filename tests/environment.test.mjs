import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicEnvironment, httpOrigin, publishableKey, signedUrlTtl } from "../lib/env/validation.ts";
import { smtpConfig, managementConfig, authSmtpPayload, matchesAuthConfig, email } from "../scripts/lib/smtp-config.mjs";
import { issueSourceDownload } from "../lib/storage/download-policy.ts";

const publishable = "sb_publishable_0123456789abcdef0123456789abcdef";
test("only the two approved public variables are accepted", () => {
  assert.doesNotThrow(() => assertPublicEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable, SMTP_PASS: "private" }));
  for (const name of ["NEXT_PUBLIC_SMTP_PASS", "NEXT_PUBLIC_SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_ACCESS_TOKEN"]) {
    assert.throws(() => assertPublicEnvironment({ [name]: "private" }));
  }
});
test("Vercel system variables are accepted, credential-like names are not", () => {
  assert.doesNotThrow(() => assertPublicEnvironment({ NEXT_PUBLIC_VERCEL_ENV: "preview", NEXT_PUBLIC_VERCEL_URL: "nexora-git-x.vercel.app", NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "abc", NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG: "{}" }));
  for (const name of ["NEXT_PUBLIC_VERCEL_AUTOMATION_BYPASS_SECRET", "NEXT_PUBLIC_VERCEL_TOKEN", "NEXT_PUBLIC_VERCEL_API_KEY"]) {
    assert.throws(() => assertPublicEnvironment({ [name]: "private" }));
  }
  assert.throws(() => assertPublicEnvironment({ NEXT_PUBLIC_VERCEL_ENV: "sb_secret_0123456789abcdef" }));
});
test("private and legacy privileged keys cannot masquerade as a public key", () => {
  for (const key of ["sb_secret_0123456789abcdef", "service_role", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig", "sb_publishable_replace_me"]) {
    assert.throws(() => publishableKey(key));
  }
  assert.equal(publishableKey(publishable), publishable);
});
test("configuration errors contain variable names, never their values", () => {
  const secret = "sb_secret_CANARY_DO_NOT_DISCLOSE";
  assert.throws(() => publishableKey(secret), (e) => !e.message.includes(secret) && e.message.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"));
});
test("remote origins require HTTPS and cannot contain credentials or paths", () => {
  for (const origin of ["http://example.com", "https://user:password@example.com", "https://example.com/path", "https://example.com/?secret=1", "file:///tmp/file"]) {
    assert.throws(() => httpOrigin(origin, "APP_URL"));
  }
  assert.equal(httpOrigin("http://localhost:3000", "APP_URL"), "http://localhost:3000");
});
test("signed URL lifetime defaults to 60 seconds and cannot exceed five minutes", () => {
  assert.equal(signedUrlTtl(undefined), 60);
  assert.equal(signedUrlTtl("300"), 300);
  for (const value of ["0", "301", "-1", "1.5", "60s", ""]) assert.throws(() => signedUrlTtl(value));
});
const smtpEnv = { SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_USER: "smtp-user", SMTP_PASS: " private-password ", SMTP_FROM_EMAIL: "noreply@example.com", SMTP_FROM_NAME: "Nexora" };
test("SMTP password is preserved verbatim and is confined to the management payload", () => {
  const config = smtpConfig(smtpEnv);
  assert.equal(config.pass, smtpEnv.SMTP_PASS);
  const payload = authSmtpPayload(config);
  assert.equal(payload.smtp_pass, smtpEnv.SMTP_PASS);
  assert.equal(payload.mailer_autoconfirm, false);
  assert.equal(payload.external_email_enabled, true);
});
test("SMTP readback handles a redacted password but detects incorrect settings", () => {
  const payload = authSmtpPayload(smtpConfig(smtpEnv));
  assert.equal(matchesAuthConfig({ ...payload, smtp_pass: null, smtp_port: "587" }, payload), true);
  assert.equal(matchesAuthConfig({ ...payload, smtp_host: "wrong.example.com" }, payload), false);
  assert.equal(matchesAuthConfig({ ...payload, mailer_autoconfirm: true }, payload), false);
});
test("SMTP validation blocks malformed ports, headers and multiple recipients", () => {
  for (const port of ["0", "65536", "587x"]) assert.throws(() => smtpConfig({ ...smtpEnv, SMTP_PORT: port }));
  assert.throws(() => smtpConfig({ ...smtpEnv, SMTP_FROM_NAME: "Nexora\r\nBcc: victim@example.com" }));
  assert.throws(() => email("first@example.com,second@example.com", "SMTP_TEST_TO"));
  assert.throws(() => managementConfig({ SUPABASE_PROJECT_REF: "../other", SUPABASE_ACCESS_TOKEN: "not-printed" }));
});

test("Gmail sender must match the authenticated mailbox", () => {
  assert.throws(() => smtpConfig({ ...smtpEnv, SMTP_HOST: "smtp.gmail.com", SMTP_USER: "first@gmail.com", SMTP_FROM_EMAIL: "second@gmail.com" }));
  assert.doesNotThrow(() => smtpConfig({ ...smtpEnv, SMTP_HOST: "smtp.gmail.com", SMTP_USER: "first@gmail.com", SMTP_FROM_EMAIL: "first@gmail.com" }));
});

function storageClient({ user = { id: "user" }, source = { file_path: "workspace/source/private.pdf" }, authError = null, storageError = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: { async getUser(token) { calls.push(["auth", token]); return { data: { user }, error: authError }; } },
    from(table) {
      calls.push(["table", table]);
      return { select(fields) {
        calls.push(["fields", fields]);
        return { eq(column, value) {
          calls.push(["lookup", column, value]);
          return { async maybeSingle() { return { data: source, error: null }; } };
        } };
      } };
    },
    storage: { from(bucket) { return { async createSignedUrl(path, ttl, options) {
      calls.push(["sign", bucket, path, ttl, options]);
      return { data: storageError ? null : { signedUrl: "https://example.com/temporary?token=temporary" }, error: storageError };
    } }; } },
  };
}
test("a missing or invalid authenticated user cannot query sources or sign a file", async () => {
  const client = storageClient({ user: null });
  await assert.rejects(issueSourceDownload(client, "invalid-token", "source-id", 60), (e) => e.status === 401);
  assert.deepEqual(client.calls, [["auth", "invalid-token"]]);
});
test("an RLS-hidden or nonexistent source cannot produce a signed URL", async () => {
  const client = storageClient({ source: null });
  await assert.rejects(issueSourceDownload(client, "user-token", "foreign-source", 60), (e) => e.status === 404);
  assert.equal(client.calls.some(([operation]) => operation === "sign"), false);
});
test("an authorized source returns only a temporary URL and bounded expiry", async () => {
  const client = storageClient();
  const result = await issueSourceDownload(client, "user-token", "source-id", 60);
  assert.deepEqual(Object.keys(result).sort(), ["expiresIn", "signedUrl"]);
  assert.deepEqual(client.calls.at(-1), ["sign", "nexora-sources", "workspace/source/private.pdf", 60, { download: true }]);
  assert.equal(result.expiresIn, 60);
});
test("storage provider diagnostics never escape through access errors", async () => {
  const client = storageClient({ storageError: { message: "SMTP_PASS=NEVER_DISCLOSE" } });
  await assert.rejects(issueSourceDownload(client, "user-token", "source-id", 60), (e) => e.status === 404 && !e.message.includes("NEVER_DISCLOSE"));
});
