/**
 * Payment Link Service
 *
 * Generates unique payment/collection links for bill splits.
 * Structure aligned with SFA "Iniciación de Pagos" (NCG 514).
 *
 * Flow:
 * 1. Creator generates a cobro link with their bank details
 * 2. Link is shared via WhatsApp/Web Share API
 * 3. Recipient opens link, sees amount and transfer instructions
 * 4. System watches for matching deposits (reconciliation)
 */

import { formatRut, isValidRut, type SfaPaymentInitiation } from "./sfaCodes.js";
import { logger } from "../../logger.js";
import crypto from "crypto";

/**
 * Transfer details for the payment recipient (cobrador)
 */
export interface TransferDetails {
  banco: string;
  tipoCuenta: string; // 'corriente' | 'vista' | 'rut' | 'ahorro'
  numeroCuenta: string;
  rut: string;
  nombre: string;
  email: string;
  sfaTipoCuenta?: string; // SFA product code (A001, A002, A003)
}

/**
 * Payment link data structure
 */
export interface PaymentLink {
  id: string;
  billSplitId: number;
  participantId: number;
  shareCode: string;
  amount: number;
  currency: string;
  concept: string;
  transferDetails: TransferDetails;
  createdAt: string;
  expiresAt: string;
  status: "active" | "paid" | "expired" | "cancelled";
}

/**
 * Map account type name to SFA product code
 */
function mapAccountTypeToSfa(tipoCuenta: string): string {
  const type = tipoCuenta.toLowerCase();
  if (type.includes("corriente") || type === "corriente") return "A001";
  if (type.includes("vista") || type === "vista") return "A002";
  if (type.includes("rut") || type === "rut") return "A003";
  if (type.includes("provisión") || type.includes("provision") || type === "provision")
    return "A004";
  if (type.includes("ahorro")) return "A007";
  return "A002";
}

/**
 * Generate a unique payment link ID
 */
function generatePaymentLinkId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString("hex");
  return `pay-${timestamp}-${random}`;
}

/**
 * Create a payment/collection link for a bill split participant
 */
export function createPaymentLink(params: {
  billSplitId: number;
  participantId: number;
  shareCode: string;
  amount: number;
  concept: string;
  transferDetails: TransferDetails;
  expiryDays?: number;
}): PaymentLink {
  const {
    billSplitId,
    participantId,
    shareCode,
    amount,
    concept,
    transferDetails,
    expiryDays = 30,
  } = params;

  // Validate RUT if provided
  if (
    transferDetails.rut &&
    !isValidRut(transferDetails.rut.replace(/\./g, "").replace(/-/g, ""))
  ) {
    logger.warn({ rut: transferDetails.rut }, "Invalid RUT in transfer details");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

  const link: PaymentLink = {
    id: generatePaymentLinkId(),
    billSplitId,
    participantId,
    shareCode,
    amount,
    currency: "CLP",
    concept,
    transferDetails: {
      ...transferDetails,
      rut: formatRut(transferDetails.rut),
      sfaTipoCuenta: mapAccountTypeToSfa(transferDetails.tipoCuenta),
    },
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "active",
  };

  logger.info(
    {
      paymentLinkId: link.id,
      billSplitId,
      amount,
    },
    "Payment link created",
  );

  return link;
}

/**
 * Build the public URL for a payment link
 */
export function buildPaymentLinkUrl(baseUrl: string, shareCode: string): string {
  return `${baseUrl}/split/${shareCode}`;
}

/**
 * Generate a WhatsApp share message for a payment link
 */
export function generateWhatsAppMessage(params: {
  amount: number;
  concept: string;
  creatorName: string;
  shareCode: string;
  baseUrl: string;
  transferDetails: TransferDetails;
}): string {
  const { amount, concept, creatorName, shareCode, baseUrl, transferDetails } = params;

  const formattedAmount = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);

  const paymentUrl = buildPaymentLinkUrl(baseUrl, shareCode);

  const message = [
    `💸 *${creatorName}* te envía un cobro`,
    ``,
    `📋 *Concepto:* ${concept}`,
    `💰 *Monto:* ${formattedAmount}`,
    ``,
    `🏦 *Datos para transferir:*`,
    `• Banco: ${transferDetails.banco}`,
    `• Tipo cuenta: ${transferDetails.tipoCuenta}`,
    `• N° cuenta: ${transferDetails.numeroCuenta}`,
    `• RUT: ${transferDetails.rut}`,
    `• Nombre: ${transferDetails.nombre}`,
    `• Email: ${transferDetails.email}`,
    ``,
    `✅ Marca tu pago como realizado aquí:`,
    paymentUrl,
    ``,
    `_Enviado desde CODA_`,
  ].join("\n");

  return message;
}

/**
 * Generate Web Share API compatible data
 */
export function generateShareData(params: {
  amount: number;
  concept: string;
  creatorName: string;
  shareCode: string;
  baseUrl: string;
}): { title: string; text: string; url: string } {
  const { amount, concept, creatorName, shareCode, baseUrl } = params;

  const formattedAmount = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);

  return {
    title: `Cobro de ${creatorName}`,
    text: `${creatorName} te pide ${formattedAmount} por "${concept}"`,
    url: buildPaymentLinkUrl(baseUrl, shareCode),
  };
}

/**
 * Build SFA Payment Initiation structure for a payment link
 * (For future SFA API integration when transactional APIs go live)
 */
export function buildSfaPaymentInitiation(
  paymentLink: PaymentLink,
  payerDetails: {
    rut: string;
    nombre: string;
    banco: string;
    cuenta: string;
    tipoCuenta: string;
  },
): SfaPaymentInitiation {
  return {
    tipoOperacion: "tef",
    institucionOrigen: payerDetails.banco,
    cuentaOrigen: payerDetails.cuenta,
    tipoCuentaOrigen: mapAccountTypeToSfa(payerDetails.tipoCuenta),
    rutPagador: payerDetails.rut,
    nombrePagador: payerDetails.nombre,
    institucionDestino: paymentLink.transferDetails.banco,
    cuentaDestino: paymentLink.transferDetails.numeroCuenta,
    tipoCuentaDestino: paymentLink.transferDetails.sfaTipoCuenta || "A002",
    rutReceptor: paymentLink.transferDetails.rut,
    nombreReceptor: paymentLink.transferDetails.nombre,
    monto: paymentLink.amount,
    moneda: "CLP",
    fechaHoraOperacion: new Date().toISOString(),
  };
}
