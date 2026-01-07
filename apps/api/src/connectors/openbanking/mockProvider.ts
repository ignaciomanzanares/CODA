export type OBAccount = {
  providerAccountId: string;
  name?: string;
  officialName?: string;
  type?: string;
  subtype?: string;
  currency?: string;
  mask?: string;
  openedAt?: Date;
};

export type OBBalance = {
  current: number;
  available?: number;
  creditLimit?: number;
  currency?: string;
  asOf?: Date;
};

export type OBTransaction = {
  externalId: string;
  postedAt: Date;
  description?: string;
  merchantName?: string;
  amount: number; // positive for debit/credit? We'll store signed
  currency?: string;
  category?: string;
  subcategory?: string;
  pending?: boolean;
  raw?: unknown;
};

export interface OBProvider {
  listAccounts(userId: string): Promise<OBAccount[]>;
  getBalance(providerAccountId: string): Promise<OBBalance>;
  listTransactions(providerAccountId: string, from: Date, to: Date): Promise<OBTransaction[]>;
}

// A simple mock provider for local development
export class MockProvider implements OBProvider {
  async listAccounts(_userId: string): Promise<OBAccount[]> {
    return [
      { providerAccountId: "mock-checking-001", name: "Checking", type: "checking", currency: "USD", mask: "1234", openedAt: daysAgo(365) },
      { providerAccountId: "mock-savings-001", name: "Savings", type: "savings", currency: "USD", mask: "5678", openedAt: daysAgo(720) },
      { providerAccountId: "mock-cc-001", name: "Credit Card", type: "credit_card", currency: "USD", mask: "4321", openedAt: daysAgo(200) },
    ];
  }

  async getBalance(providerAccountId: string): Promise<OBBalance> {
    const now = new Date();
    switch (providerAccountId) {
      case "mock-checking-001":
        return { current: 1450.23, available: 1430.23, currency: "USD", asOf: now };
      case "mock-savings-001":
        return { current: 10250.0, available: 10250.0, currency: "USD", asOf: now };
      default:
        return { current: -325.5, available: undefined, creditLimit: 2000, currency: "USD", asOf: now };
    }
  }

  async listTransactions(providerAccountId: string, from: Date, to: Date): Promise<OBTransaction[]> {
    // Generate a few synthetic transactions in range
    const arr: OBTransaction[] = [];
    const days = Math.min(90, Math.ceil((to.getTime() - from.getTime()) / 86400000));
    for (let i = 0; i < days; i += Math.ceil(Math.random() * 7)) {
      const d = new Date(to.getTime() - i * 86400000);
      if (providerAccountId.includes("checking")) {
        arr.push({ externalId: `${providerAccountId}-${i}`, postedAt: d, description: "Grocery Store", merchantName: "Whole Foods", amount: -45 - Math.random() * 60, currency: "USD", category: "Groceries" });
        arr.push({ externalId: `${providerAccountId}-pay-${i}`, postedAt: d, description: "Salary", merchantName: "Acme Inc", amount: 200 + Math.random() * 100, currency: "USD", category: "Income" });
      } else if (providerAccountId.includes("savings")) {
        arr.push({ externalId: `${providerAccountId}-int-${i}`, postedAt: d, description: "Interest", merchantName: "Bank", amount: 1 + Math.random() * 3, currency: "USD", category: "Interest" });
      } else {
        arr.push({ externalId: `${providerAccountId}-cc-${i}`, postedAt: d, description: "Online Purchase", merchantName: "Amazon", amount: -20 - Math.random() * 80, currency: "USD", category: "Shopping" });
      }
    }
    return arr;
  }
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
