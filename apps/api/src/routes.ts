import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { registerEmpresasRoutes } from "./routes-empresas.js";
import { registerConsentRoutes } from "./routes-consent.js";
import { registerPrivacyConsentRoutes } from "./routes-privacy-consent.js";
import { registerOnboardingRoutes } from "./routes-onboarding.js";
import { registerTestRoutes } from "./routes-test.js";
import { registerDocumentParsingAndScoringRoutes } from "./routes-scoring-documents.js";
import { registerDashboardRoutes } from "./routes-dashboard.js";

import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

import { apiLimiter } from "./middleware/rateLimiter.js";

import { registerAuthRoutes } from "./routes-auth.js";
import { registerFinancialSummaryRoutes } from "./routes-financial-summary.js";
import { registerAssistantRoutes } from "./routes-assistant.js";
import { registerAccountsTransactionsRoutes } from "./routes-accounts-transactions.js";
import { registerGoalsRoutes } from "./routes-goals.js";
import { registerNotificationsRoutes } from "./routes-notifications.js";
import { registerPushRoutes } from "./routes-push.js";
import { registerDocumentsRoutes } from "./routes-documents.js";
import { registerTransactionsInsightsRoutes } from "./routes-transactions-insights.js";
import { registerScoringRiskRoutes } from "./routes-scoring-risk.js";
import { registerExpensesRoutes, registerExpensesAutomationRoutes } from "./routes-expenses.js";
import { registerBillSplitsRoutes, registerBillSplitSharingRoutes } from "./routes-bill-splits.js";
import { registerProfileRoutes } from "./routes-profile.js";
import { registerSupportRoutes } from "./routes-support.js";
import { registerProductsRoutes } from "./routes-products.js";
import { registerAdminRoutes, registerAdminRecategorizeRoutes } from "./routes-admin.js";

/**
 * Orquestador de rutas. Cada dominio vive en su propio routes-<dominio>.ts;
 * el ORDEN de los await es el orden de registro en Express y NO debe
 * cambiarse a la ligera (middleware y especificidad de paths dependen de él).
 * Extraído mecánicamente del routes.ts monolítico (5.680 líneas) — commit con
 * inventario de endpoints verificado idéntico antes/después.
 */
export async function registerRoutes(app: Express): Promise<Server> {
  await registerAuthRoutes(app);

  const handleZodError = (
    err: unknown,
    _req: Request,
    res: Response,
    next: (...args: unknown[]) => unknown,
  ) => {
    if (err instanceof ZodError) {
      const validationError = fromZodError(err);
      return res.status(400).json({
        message: "Validation error",
        errors: validationError.details,
      });
    }
    next(err);
  };

  app.use("/api", handleZodError);

  // Apply rate limiting to all API routes
  app.use("/api", apiLimiter);

  // CODA Empresas API (misma BD, prefijo /api/empresas)
  registerEmpresasRoutes(app);

  // Panel de Control de Consentimientos (RAR + Grant Management)
  registerConsentRoutes(app);
  registerPrivacyConsentRoutes(app);
  registerOnboardingRoutes(app);

  // Simulación de flujo bancario (consent + webhook + mock SFA + score)
  registerTestRoutes(app);

  // --- Protected routes (require JWT authentication) ---

  await registerFinancialSummaryRoutes(app);
  await registerAssistantRoutes(app);
  await registerAccountsTransactionsRoutes(app);
  await registerGoalsRoutes(app);
  await registerNotificationsRoutes(app);
  await registerPushRoutes(app);
  await registerDocumentsRoutes(app);
  await registerTransactionsInsightsRoutes(app);
  await registerScoringRiskRoutes(app);
  await registerExpensesRoutes(app);
  await registerBillSplitsRoutes(app);
  await registerProfileRoutes(app);
  await registerSupportRoutes(app);
  await registerProductsRoutes(app);
  await registerAdminRoutes(app);
  await registerExpensesAutomationRoutes(app);
  await registerBillSplitSharingRoutes(app);

  registerDocumentParsingAndScoringRoutes(app);
  registerDashboardRoutes(app);

  await registerAdminRecategorizeRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
