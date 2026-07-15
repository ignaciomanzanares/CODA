/**
 * Cliente HTTPS con soporte para mTLS y headers FAPI 2.0.
 * - Certificados desde variables de entorno BANK_CERT y BANK_KEY (Base64, estándar Render/Vercel).
 * - Inyección automática de x-fapi-financial-id y x-fapi-interaction-id por petición.
 */

import https from "https";
import { randomUUID } from "crypto";

const BANK_CERT_B64 = process.env.BANK_CERT;
const BANK_KEY_B64 = process.env.BANK_KEY;
const FAPI_FINANCIAL_ID = process.env.FAPI_FINANCIAL_ID ?? process.env.X_FAPI_FINANCIAL_ID ?? "";

function decodeBase64ToBuffer(b64: string | undefined): Buffer | undefined {
  if (!b64 || typeof b64 !== "string") return undefined;
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return undefined;
  }
}

let mtlsAgent: https.Agent | undefined;

function getMtlsAgent(): https.Agent | undefined {
  if (mtlsAgent !== undefined) return mtlsAgent;
  const cert = decodeBase64ToBuffer(BANK_CERT_B64);
  const key = decodeBase64ToBuffer(BANK_KEY_B64);
  if (!cert?.length || !key?.length) {
    mtlsAgent = undefined;
    return undefined;
  }
  mtlsAgent = new https.Agent({
    cert,
    key,
    rejectUnauthorized: true,
  });
  return mtlsAgent;
}

export interface FapiHttpClientOptions {
  /** Override del identificador financiero (por defecto FAPI_FINANCIAL_ID / BANK_CERT) */
  financialId?: string;
  /** Headers adicionales por petición */
  headers?: Record<string, string>;
  /** Timeout en ms */
  timeout?: number;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeout?: number;
}

/**
 * Realiza una petición HTTPS con mTLS (si BANK_CERT/BANK_KEY están definidos) e inyecta
 * headers FAPI 2.0: x-fapi-financial-id y x-fapi-interaction-id (UUID único por petición).
 */
export function request(
  url: string | URL,
  options: RequestOptions = {},
  clientOptions: FapiHttpClientOptions = {},
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const urlObj = typeof url === "string" ? new URL(url) : url;
  const financialId = clientOptions.financialId ?? FAPI_FINANCIAL_ID;
  const interactionId = randomUUID();
  const agent = getMtlsAgent();

  const headers: Record<string, string> = {
    ...options.headers,
  };
  if (financialId) headers["x-fapi-financial-id"] = financialId;
  headers["x-fapi-interaction-id"] = interactionId;
  const bodyBuffer =
    options.body === undefined
      ? undefined
      : Buffer.isBuffer(options.body)
        ? options.body
        : Buffer.from(options.body, "utf8");
  if (bodyBuffer !== undefined) headers["Content-Length"] = String(bodyBuffer.length);

  return new Promise((resolve, reject) => {
    const reqOpts: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method ?? "GET",
      headers,
      ...(agent && { agent }),
    };

    const timeout = options.timeout ?? clientOptions.timeout;
    const req = https.request(reqOpts, (res) => {
      const resHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) {
        if (typeof v === "string") resHeaders[k] = v;
        else if (Array.isArray(v) && v[0]) resHeaders[k] = v[0];
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: resHeaders,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });

    req.on("error", reject);
    if (timeout)
      req.setTimeout(timeout, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

/**
 * GET con FAPI headers y mTLS opcional.
 */
export function get(
  url: string | URL,
  options: RequestOptions = {},
  clientOptions: FapiHttpClientOptions = {},
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  return request(url, { ...options, method: "GET" }, clientOptions);
}

/**
 * POST con FAPI headers y mTLS opcional.
 */
export function post(
  url: string | URL,
  body?: string | Buffer | object,
  options: RequestOptions = {},
  clientOptions: FapiHttpClientOptions = {},
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const bodyStr =
    body === undefined
      ? undefined
      : typeof body === "string" || Buffer.isBuffer(body)
        ? body
        : JSON.stringify(body);
  const headers = { ...options.headers };
  if (bodyStr !== undefined && typeof body === "object" && !Buffer.isBuffer(body))
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  return request(url, { ...options, method: "POST", headers, body: bodyStr }, clientOptions);
}

/**
 * Indica si el cliente está configurado con certificados mTLS (BANK_CERT y BANK_KEY en Base64).
 */
export function isMtlsConfigured(): boolean {
  const cert = decodeBase64ToBuffer(BANK_CERT_B64);
  const key = decodeBase64ToBuffer(BANK_KEY_B64);
  return !!(cert?.length && key?.length);
}

const httpClient = {
  request,
  get,
  post,
  isMtlsConfigured,
  getMtlsAgent,
};

export default httpClient;
