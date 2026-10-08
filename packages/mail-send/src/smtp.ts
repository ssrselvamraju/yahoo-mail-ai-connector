import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import type { CredentialStore } from "../../yahoo-imap/src/credentials.js";
import type { SendAdapter, SendContent, SendResult } from "./service.js";

export const yahooSmtpOptions = {
  host: "smtp.mail.yahoo.com", port: 465, secure: true,
  tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" as const },
  connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 30_000, dnsTimeout: 10_000,
  logger: false, debug: false, transactionLog: false, disableFileAccess: true, disableUrlAccess: true, maxRecipients: 10,
};
export class SmtpAdapter implements SendAdapter {
  constructor(private readonly credentials: CredentialStore, private readonly options: SMTPTransport.Options = yahooSmtpOptions) {}
  async submit(from: string, content: SendContent, messageId: string): Promise<SendResult> {
    const credentials = await this.credentials.load();
    if (credentials.email !== from) return { status: "failed", errorCode: "account_changed" };
    const transport = nodemailer.createTransport({ ...this.options, auth: { user: credentials.email, pass: credentials.appPassword } });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Nodemailer strips Bcc from recipient-facing headers and includes it in the SMTP envelope.
      const result = await Promise.race([transport.sendMail({ from, to: content.to, cc: content.cc, bcc: content.bcc, subject: content.subject, text: content.body, messageId, disableFileAccess: true, disableUrlAccess: true }), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { transport.close(); reject(Error("SMTP deadline reached")); }, 45_000);
      })]);
      const acceptedCount = result.accepted.length, rejectedCount = result.rejected.length;
      return { status: rejectedCount ? "partial" : "accepted", messageId, acceptedCount, rejectedCount };
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      // Only pre-submission authentication and certificate failures are known failures; all other outcomes are conservative.
      if (code === "EAUTH") return { status: "failed", errorCode: "authentication_failed" };
      if (/CERT|TLS|SSL/.test(code)) return { status: "failed", errorCode: "tls_failed" };
      return { status: "unknown", messageId, errorCode: "submission_uncertain" };
    } finally { if (timer) clearTimeout(timer); credentials.appPassword = ""; transport.close(); }
  }
}
