/**
 * Email service for CODA.
 * Priority: Resend (HTTP API) → Gmail SMTP → SMTP genérico → Ethereal (dev)
 * Resend is preferred because it doesn't suffer from SMTP timeouts on cloud hosts.
 */
import nodemailer from "nodemailer";
import type { BillSplit } from "../schema.js";
import { logger } from "../logger.js";
import { env } from "../env.js";

interface BillSplitInvitation {
  billSplit: BillSplit;
  participantName: string;
  participantEmail: string;
  amountOwed: string;
  creatorName: string;
}

// ── Resend client (lazy-init) ────────────────────────────────────────────────

let resendClient: import("resend").Resend | null = null;
let resendInitFailed = false;
let resendFrom: string = "";

async function getResend(): Promise<import("resend").Resend | null> {
  if (resendClient) return resendClient;
  if (resendInitFailed) return null;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  try {
    const { Resend } = await import("resend");
    resendClient = new Resend(apiKey);
    resendFrom = process.env.RESEND_FROM || process.env.EMAIL_FROM || "CODA <info@codafinance.cl>";
    logger.info({ provider: "resend", from: resendFrom }, "Email service: Resend configured");
    return resendClient;
  } catch (e) {
    resendInitFailed = true;
    logger.warn({ err: e }, "Failed to initialize Resend client");
    return null;
  }
}

// ── Unified send function ────────────────────────────────────────────────────

async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  // Try Resend first (HTTP API — fast, no SMTP timeout issues)
  const resend = await getResend();
  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: resendFrom,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      if (error) {
        logger.error({ error, to: redactEmail(opts.to) }, "Resend: send failed");
        return false;
      }
      logger.info({ to: redactEmail(opts.to), provider: "resend" }, "Email sent via Resend");
      return true;
    } catch (e) {
      logger.error({ err: e, to: redactEmail(opts.to) }, "Resend: exception");
      // Fall through to nodemailer
    }
  }

  // Fallback: nodemailer (Gmail / SMTP)
  const transporter = getNodemailerTransporter();
  if (!transporter) {
    logger.error("No email provider available (set RESEND_API_KEY, GMAIL_USER, or SMTP_HOST)");
    return false;
  }

  try {
    const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || '"CODA" <noreply@coda.app>';
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    logger.info({ to: redactEmail(opts.to), provider: "nodemailer" }, "Email sent via nodemailer");
    return true;
  } catch (e) {
    logger.error({ err: e, to: redactEmail(opts.to) }, "Nodemailer: send failed");
    return false;
  }
}

function redactEmail(email: string): string {
  return `${email[0] ?? "?"}***@${email.split("@")[1] ?? "?"}`;
}

/**
 * True si hay al menos un proveedor de email configurado (Resend / Gmail / SMTP).
 * Única fuente de verdad para decidir el fail-closed de 2FA: evita que el chequeo
 * en el login se desincronice de la lista de proveedores de `sendEmail()`.
 * (Ethereal de dev no cuenta: solo aplica fuera de producción.)
 */
export function isEmailConfigured(): boolean {
  return (
    !!process.env.RESEND_API_KEY ||
    !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
    !!(process.env.SMTP_HOST && process.env.SMTP_USER)
  );
}

// ── Nodemailer transporter (lazy singleton) ──────────────────────────────────

let _transporter: nodemailer.Transporter | null | undefined; // undefined = not initialized

function getNodemailerTransporter(): nodemailer.Transporter | null {
  if (_transporter !== undefined) return _transporter;

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (gmailUser && gmailPass) {
    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
      greetingTimeout: 10_000,
    });
    logger.info({ provider: "gmail", user: gmailUser }, "Nodemailer: Gmail configured (fallback)");
    return _transporter;
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
      greetingTimeout: 10_000,
    });
    logger.info({ provider: "smtp" }, "Nodemailer: SMTP configured (fallback)");
    return _transporter;
  }

  if (process.env.NODE_ENV !== "production") {
    // Dev: don't block startup with async ethereal creation
    _transporter = null;
    nodemailer
      .createTestAccount()
      .then((testAccount) => {
        _transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: { user: testAccount.user, pass: testAccount.pass },
        });
        logger.info(
          { provider: "ethereal", user: testAccount.user },
          "Nodemailer: Ethereal configured (dev)",
        );
      })
      .catch(() => {
        /* ignore */
      });
    return null;
  }

  _transporter = null;
  logger.warn("No nodemailer transport configured");
  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

class EmailService {
  async send2FACode(to: string, code: string): Promise<boolean> {
    return sendEmail({
      to,
      subject: "Tu código de verificación CODA",
      text: `Tu código de verificación es: ${code}\n\nVálido por 10 minutos. Si no solicitaste este código, ignora este mensaje.`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;background:#FF5C35;color:white;padding:8px 16px;border-radius:8px;font-weight:bold;font-size:18px;">CODA</div>
          </div>
          <p style="color:#334155;font-size:15px;">Tu código de verificación es:</p>
          <div style="background:#f1f5f9;border-radius:12px;padding:20px;text-align:center;margin:16px 0;">
            <span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#1e293b;">${code}</span>
          </div>
          <p style="color:#64748b;font-size:13px;">Válido por 10 minutos. Si no solicitaste este código, puedes ignorar este correo.</p>
        </div>
      `,
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
    return sendEmail({
      to,
      subject: "Restablecer contraseña CODA",
      text: `Recibimos una solicitud para restablecer tu contraseña.\n\nHaz clic en el siguiente enlace (válido por 1 hora):\n${resetUrl}\n\nSi no solicitaste esto, ignora este mensaje.`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;background:#FF5C35;color:white;padding:8px 16px;border-radius:8px;font-weight:bold;font-size:18px;">CODA</div>
          </div>
          <p style="color:#334155;font-size:15px;">Recibimos una solicitud para restablecer la contraseña de tu cuenta CODA.</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${resetUrl}" style="display:inline-block;background:#FF5C35;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
              Restablecer contraseña
            </a>
          </div>
          <p style="color:#64748b;font-size:13px;">El enlace es válido por 1 hora. Si no solicitaste esto, puedes ignorar este correo.</p>
        </div>
      `,
    });
  }

  async sendBillSplitInvitation(invitation: BillSplitInvitation): Promise<string | null> {
    const { billSplit, participantName, participantEmail, amountOwed, creatorName } = invitation;
    const billSplitUrl = `${env.clientUrl}/invite?billId=${billSplit.id}&email=${encodeURIComponent(participantEmail)}`;

    const sent = await sendEmail({
      to: participantEmail,
      subject: `💰 Te invitaron a dividir "${billSplit.name}" — $${amountOwed}`,
      text: this.generateInvitationText(invitation, billSplitUrl),
      html: this.generateInvitationHTML(invitation, billSplitUrl),
    });

    return sent ? "sent" : null;
  }

  private generateInvitationHTML(invitation: BillSplitInvitation, billSplitUrl: string): string {
    const { billSplit, participantName, amountOwed, creatorName } = invitation;
    return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#FF5C35;color:white;padding:8px 16px;border-radius:8px;font-weight:bold;font-size:18px;">CODA</div>
        <p style="color:#64748b;font-size:14px;margin-top:8px;">Dividir cuenta</p>
      </div>

      <p style="color:#334155;font-size:15px;">Hola ${participantName},</p>
      <p style="color:#334155;font-size:15px;"><strong>${creatorName}</strong> te invitó a dividir:</p>

      <div style="background:#f1f5f9;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #FF5C35;">
        <h3 style="margin:0 0 8px;color:#1e293b;">${billSplit.name}</h3>
        ${billSplit.description ? `<p style="color:#64748b;margin:0 0 8px;font-style:italic;">${billSplit.description}</p>` : ""}
        <p style="margin:4px 0;color:#475569;">📅 ${new Date(billSplit.date).toLocaleDateString("es-CL")}</p>
        <p style="margin:4px 0;color:#475569;">💵 Total: $${Number(billSplit.totalAmount).toLocaleString("es-CL")}</p>
        <div style="text-align:center;margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;">
          <span style="font-size:24px;font-weight:bold;color:#dc2626;">Tu parte: $${amountOwed}</span>
        </div>
      </div>

      <div style="text-align:center;margin:24px 0;">
        <a href="${billSplitUrl}" style="display:inline-block;background:#FF5C35;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
          Ver detalle
        </a>
      </div>

      <p style="color:#94a3b8;font-size:12px;text-align:center;">Enviado por CODA en nombre de ${creatorName}.</p>
    </div>
    `;
  }

  private generateInvitationText(invitation: BillSplitInvitation, billSplitUrl: string): string {
    const { billSplit, participantName, amountOwed, creatorName } = invitation;
    return `Hola ${participantName},

${creatorName} te invitó a dividir:

📝 ${billSplit.name}
${billSplit.description ? `💭 ${billSplit.description}` : ""}
📅 Fecha: ${new Date(billSplit.date).toLocaleDateString("es-CL")}
💵 Total: $${Number(billSplit.totalAmount).toLocaleString("es-CL")}

💰 Tu parte: $${amountOwed}

Ver detalle: ${billSplitUrl}

— CODA`;
  }
}

export const emailService = new EmailService();
