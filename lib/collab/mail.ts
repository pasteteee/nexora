import "server-only";
import nodemailer from "nodemailer";
import { roleLabel, INVITATION_HOURS, type InvitationRole } from "./types";

/**
 * Письмо-приглашение через SMTP приложения. Переменные те же, что в .env.smtp.example,
 * но задаются в окружении сервера (Vercel). Без них письмо не отправляется,
 * а владелец получает ссылку, чтобы передать её сам.
 */
export function smtpFromEnv(env: Record<string, string | undefined> = process.env) {
  const host = env.SMTP_HOST?.trim(), user = env.SMTP_USER?.trim(), pass = env.SMTP_PASS;
  const fromEmail = env.SMTP_FROM_EMAIL?.trim(), port = Number(env.SMTP_PORT || 587);
  if (!host || !user || !pass || !fromEmail || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const fromName = (env.SMTP_FROM_NAME?.trim() || "Nexora").replace(/[\r\n\0"]/g, "");
  return { host, port, user, pass, fromEmail, fromName };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function invitationLetter(p: { workspaceName: string; inviterName: string; role: InvitationRole; link: string }) {
  const role = roleLabel[p.role].toLowerCase();
  const who = p.inviterName.trim() || "Владелец тетради";
  const subject = `Приглашение в тетрадь «${p.workspaceName}» — Nexora`;
  const text = [
    `${who} приглашает вас в тетрадь «${p.workspaceName}» с ролью «${role}».`,
    "",
    `Принять приглашение: ${p.link}`,
    "",
    `Ссылка действует ${INVITATION_HOURS} часа и только для этого адреса. Если вы не ждали письма, просто удалите его.`,
  ].join("\n");
  const html = `<p>${escapeHtml(who)} приглашает вас в тетрадь «${escapeHtml(p.workspaceName)}» с ролью «${escapeHtml(role)}».</p>`
    + `<p><a href="${escapeHtml(p.link)}">Принять приглашение</a></p>`
    + `<p style="color:#666">Ссылка действует ${INVITATION_HOURS} часа и только для этого адреса. Если вы не ждали письма, просто удалите его.</p>`;
  return { subject, text, html };
}

export async function sendInvitation(to: string, letter: { subject: string; text: string; html: string }): Promise<boolean> {
  const smtp = smtpFromEnv();
  if (!smtp) return false;
  const transport = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.port === 465, requireTLS: smtp.port !== 465,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  try {
    await transport.sendMail({ from: { name: smtp.fromName, address: smtp.fromEmail }, to, ...letter });
    return true;
  } catch {
    // Сбой почты не отменяет приглашение: владелец передаст ссылку вручную.
    return false;
  }
}
