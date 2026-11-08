// nodemailer 10 ships without type declarations; only the API used by the app is declared.
declare module "nodemailer" {
  interface TransportOptions {
    host: string; port: number; secure?: boolean; requireTLS?: boolean;
    auth?: { user: string; pass: string };
    connectionTimeout?: number; greetingTimeout?: number; socketTimeout?: number;
  }
  interface MailOptions { from: { name: string; address: string } | string; to: string; subject: string; text: string; html?: string }
  interface Transporter { sendMail(options: MailOptions): Promise<{ messageId: string }> }
  export function createTransport(options: TransportOptions): Transporter;
  const nodemailer: { createTransport: typeof createTransport };
  export default nodemailer;
}
