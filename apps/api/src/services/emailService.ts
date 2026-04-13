import nodemailer from 'nodemailer';
import type { BillSplit } from '../schema.js';
import { logger } from '../logger.js';
import { env } from '../env.js';

interface BillSplitInvitation {
  billSplit: BillSplit;
  participantName: string;
  participantEmail: string;
  amountOwed: string;
  creatorName: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private async initializeTransporter() {
    // Check if Gmail credentials are provided for real email sending
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    
    if (gmailUser && gmailPass) {
      // Use Gmail SMTP for real email delivery
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass, // This should be an App Password, not your regular password
        },
      });
      logger.info({ provider: 'gmail', user: gmailUser }, 'Email service initialized');
    } else if (process.env.NODE_ENV === 'production') {
      // Production SMTP configuration (you'll need to set these environment variables)
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      logger.info({ provider: 'smtp' }, 'Email service initialized');
    } else {
      // Development: Use Ethereal Email for testing (fake emails)
      try {
        const testAccount = await nodemailer.createTestAccount();
        
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        
        logger.info({ provider: 'ethereal', user: testAccount.user }, 'Email service initialized (development mode)');
      } catch (error) {
        logger.error({ err: error }, 'Failed to create test email account');
        // Fallback to a simple configuration
        this.transporter = nodemailer.createTransport({
          host: 'localhost',
          port: 1025,
          secure: false,
        });
      }
    }
  }

  async sendBillSplitInvitation(invitation: BillSplitInvitation): Promise<string | null> {
    if (!this.transporter) {
      logger.error('Email transporter not initialized');
      return null;
    }

    const { billSplit, amountOwed } = invitation;
    
    // Generate the email content
    const subject = `💰 You've been invited to split "${billSplit.name}" - $${amountOwed} owed`;
    
    const htmlContent = this.generateInvitationHTML(invitation);
    const textContent = this.generateInvitationText(invitation);

    try {
      const info = await this.transporter.sendMail({
        from: '"CODA" <noreply@coda.app>',
        to: invitation.participantEmail,
        subject: subject,
        text: textContent,
        html: htmlContent,
      });

      logger.info({ messageId: info.messageId }, 'Bill split invitation sent');
      
      // For development with Ethereal Email, log the preview URL
      if (process.env.NODE_ENV !== 'production') {
        logger.debug({ previewUrl: nodemailer.getTestMessageUrl(info) }, 'Email preview available');
      }
      
      return info.messageId;
    } catch (error) {
      logger.error({ err: error }, 'Failed to send bill split invitation');
      return null;
    }
  }

  /**
   * Envía un enlace para restablecer contraseña.
   */
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
    if (!this.transporter) {
      logger.error('Email transporter not initialized (password reset)');
      return false;
    }
    const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || '"CODA" <noreply@coda.app>';
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Restablecer contraseña CODA',
        text: `Recibimos una solicitud para restablecer tu contraseña.\n\nHaz clic en el siguiente enlace (válido por 1 hora):\n${resetUrl}\n\nSi no solicitaste esto, ignora este mensaje.`,
        html: `
          <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta CODA.</p>
          <p style="margin:24px 0;">
            <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
              Restablecer contraseña
            </a>
          </p>
          <p style="color:#64748b;font-size:14px;">El enlace es válido por 1 hora. Si no solicitaste esto, puedes ignorar este correo.</p>
        `,
      });
      logger.info({ to: `${to[0] ?? '?'}***@${to.split('@')[1] ?? '?'}` }, 'Password reset email sent');
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Failed to send password reset email');
      return false;
    }
  }

  /**
   * Código OTP para 2FA (login). Requiere transporter configurado (Gmail/SMTP o Ethereal en dev).
   */
  async send2FACode(to: string, code: string): Promise<boolean> {
    if (!this.transporter) {
      logger.error('Email transporter not initialized (2FA)');
      return false;
    }
    const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || '"CODA" <noreply@coda.app>';
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Tu código de verificación CODA',
        text: `Tu código de verificación es: ${code}\n\nVálido por 10 minutos. Si no solicitaste este código, ignora este mensaje.`,
        html: `
          <p>Tu código de verificación CODA es:</p>
          <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
          <p>Válido por 10 minutos.</p>
          <p style="color:#64748b;font-size:14px;">Si no solicitaste este código, puedes ignorar este correo.</p>
        `,
      });
      logger.info({ to: `${to[0] ?? '?'}***@${to.split('@')[1] ?? '?'}` }, '2FA email sent');
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Failed to send 2FA email');
      return false;
    }
  }

  private generateInvitationHTML(invitation: BillSplitInvitation): string {
    const { billSplit, participantName, participantEmail, amountOwed, creatorName } = invitation;
    // Link to the invitation handler page which will check user existence and handle auth
    const billSplitUrl = `${env.clientUrl}/invite?billId=${billSplit.id}&email=${encodeURIComponent(participantEmail)}`;
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bill Split Invitation</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f8f9fa;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 12px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                color: #2563eb;
            }
            .bill-details {
                background: #f1f5f9;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                border-left: 4px solid #2563eb;
            }
            .amount {
                font-size: 24px;
                font-weight: bold;
                color: #dc2626;
                text-align: center;
                margin: 15px 0;
            }
            .cta-button {
                display: inline-block;
                background: #2563eb;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 6px;
                font-weight: 600;
                text-align: center;
                margin: 20px 0;
                width: 200px;
            }
            .footer {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e2e8f0;
                font-size: 14px;
                color: #64748b;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>💰 CODA Bill Split</h1>
                <p>You've been invited to split a bill!</p>
            </div>
            
            <p>Hi ${participantName},</p>
            
            <p><strong>${creatorName}</strong> has invited you to split the following bill:</p>
            
            <div class="bill-details">
                <h3>${billSplit.name}</h3>
                ${billSplit.description ? `<p><em>${billSplit.description}</em></p>` : ''}
                <p><strong>Date:</strong> ${new Date(billSplit.date).toLocaleDateString()}</p>
                <p><strong>Total Amount:</strong> $${billSplit.totalAmount.toFixed(2)}</p>
                
                <div class="amount">
                    Your share: $${amountOwed}
                </div>
            </div>
            
            <p>To view the bill and manage your payment, click the button below:</p>
            
            <div style="text-align: center;">
                <a href="${billSplitUrl}" class="cta-button">View Bill Split</a>
            </div>
            
            <p><strong>What happens next?</strong></p>
            <ul>
                <li>Sign in to your CODA account (or create one with this email: ${participantEmail})</li>
                <li>View the bill split details</li>
                <li>Mark as paid when you've settled your portion</li>
            </ul>
            
            <div class="footer">
                <p>This invitation was sent by CODA on behalf of ${creatorName}.</p>
                <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  private generateInvitationText(invitation: BillSplitInvitation): string {
    const { billSplit, participantName, participantEmail, amountOwed, creatorName } = invitation;
    // Link to the invitation handler page which will check user existence and handle auth
    const billSplitUrl = `${env.clientUrl}/invite?billId=${billSplit.id}&email=${encodeURIComponent(participantEmail)}`;
    
    return `
Hi ${participantName},

${creatorName} has invited you to split the following bill:

📝 ${billSplit.name}
${billSplit.description ? `💭 ${billSplit.description}` : ''}
📅 Date: ${new Date(billSplit.date).toLocaleDateString()}
💵 Total Amount: $${billSplit.totalAmount.toFixed(2)}

💰 Your share: $${amountOwed}

To view the bill and manage your payment, visit:
${billSplitUrl}

What happens next?
1. Sign in to your CODA account (or create one with this email: ${participantEmail})
2. View the bill split details
3. Mark as paid when you've settled your portion

This invitation was sent by CODA on behalf of ${creatorName}.
If you didn't expect this invitation, you can safely ignore this email.

---
CODA - Smart expense management
    `;
  }
}

export const emailService = new EmailService();
