// Tipado para window.plausible (Plausible Analytics — sin cookies)
declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number | boolean> },
    ) => void;
  }
}

export const track = (event: string, props?: Record<string, string | number | boolean>): void => {
  if (typeof window !== "undefined" && typeof window.plausible === "function") {
    window.plausible(event, props ? { props } : undefined);
  }
};

/** Rango tipo "600-699" para agrupar scores en analítica. */
export function creditScoreRangeLabel(score: number): string {
  const low = Math.floor(score / 100) * 100;
  return `${low}-${low + 99}`;
}

// Eventos del negocio CODA
export const Analytics = {
  // Adquisición
  signupStarted: () => track("Signup Started"),
  signupCompleted: (role: "persona" | "empresa") => track("Signup Completed", { role }),
  loginSuccess: (role: string) => track("Login", { role }),

  // Engagement - Gastos
  expenseAdded: (category: string) => track("Expense Added", { category }),
  billSplitCreated: () => track("Bill Split Created"),
  notificationParsed: () => track("Notification Parsed"),
  cartolaParsed: () => track("Cartola Parsed"),

  // Engagement - Score
  scoreViewed: (scoreRange: string) => track("Score Viewed", { score_range: scoreRange }),
  documentUploaded: (type: "cmf" | "cartola") => track("Document Uploaded", { type }),

  // Engagement - Productos
  productClicked: (productName: string) => track("Product Clicked", { product: productName }),
  productCompared: () => track("Product Comparison Viewed"),

  // Engagement - Metas
  goalCreated: () => track("Goal Created"),
  goalCompleted: () => track("Goal Completed"),

  // Referral
  referralShared: (method: "whatsapp" | "copy") => track("Referral Shared", { method }),
  referralSignup: (code: string) => track("Referral Signup", { referral_code: code }),

  // Empresas
  empresaDashboardViewed: () => track("Empresa Dashboard Viewed"),
};
