import type { Expense, BillSplit, BillSplitParticipant } from "@shared/schema";

// Demo expense data generator
export function generateDemoExpenses(): Expense[] {
  const categories = [
    "Groceries", "Dining", "Transportation", "Housing", "Healthcare", 
    "Entertainment", "Shopping", "Utilities", "Education", "Travel"
  ];

  const merchants: Record<string, string[]> = {
    "Groceries": ["Whole Foods", "Safeway", "Trader Joe's", "Costco", "Target"],
    "Dining": ["Chipotle", "Starbucks", "Pizza Hut", "McDonald's", "Subway"],
    "Transportation": ["Uber", "Lyft", "Shell", "BP", "Metro Transit"],
    "Housing": ["Home Depot", "IKEA", "Lowe's", "Apartment Complex", "Property Manager"],
    "Healthcare": ["CVS Pharmacy", "Walgreens", "Dr. Smith's Office", "Dental Care", "Vision Center"],
    "Entertainment": ["Netflix", "Spotify", "Movie Theater", "Concert Venue", "Gaming Store"],
    "Shopping": ["Amazon", "Best Buy", "H&M", "Nike", "Apple Store"],
    "Utilities": ["PG&E", "Comcast", "Verizon", "Water Company", "Internet Provider"],
    "Education": ["University Bookstore", "Online Course", "Textbook Store", "Learning Platform"],
    "Travel": ["United Airlines", "Marriott", "Airbnb", "Car Rental", "Travel Agency"]
  };

  const descriptions: Record<string, string[]> = {
    "Groceries": ["Weekly groceries", "Fresh produce", "Household essentials", "Bulk shopping", "Organic foods"],
    "Dining": ["Lunch with colleagues", "Coffee break", "Dinner out", "Quick bite", "Weekend brunch"],
    "Transportation": ["Ride to airport", "Daily commute", "Gas fill-up", "Public transit", "Parking fee"],
    "Housing": ["Home improvement", "Furniture purchase", "Monthly rent", "Maintenance supplies", "Decoration items"],
    "Healthcare": ["Prescription refill", "Doctor visit copay", "Vitamins", "Medical supplies", "Health checkup"],
    "Entertainment": ["Monthly subscription", "Movie night", "Concert tickets", "Video games", "Streaming service"],
    "Shopping": ["New clothes", "Electronics", "Shoes", "Tech gadgets", "Personal items"],
    "Utilities": ["Electricity bill", "Internet service", "Phone bill", "Water service", "Cable subscription"],
    "Education": ["Course materials", "Online learning", "Study guides", "Educational software", "Workshop fee"],
    "Travel": ["Flight booking", "Hotel stay", "Vacation rental", "Car rental", "Travel insurance"]
  };

  const demoExpenses: Expense[] = [];
  const currentDate = new Date();

  for (let i = 0; i < 25; i++) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    const merchantList = merchants[category];
    const descriptionList = descriptions[category];
    
    const merchant = merchantList[Math.floor(Math.random() * merchantList.length)];
    const description = descriptionList[Math.floor(Math.random() * descriptionList.length)];
    
    // Generate dates in the last 3 months
    const daysAgo = Math.floor(Math.random() * 90);
    const expenseDate = new Date(currentDate);
    expenseDate.setDate(expenseDate.getDate() - daysAgo);
    
    // Generate realistic amounts based on category
    let amount: number;
    switch (category) {
      case "Groceries":
        amount = Math.round((Math.random() * 150 + 20) * 100) / 100;
        break;
      case "Dining":
        amount = Math.round((Math.random() * 80 + 10) * 100) / 100;
        break;
      case "Transportation":
        amount = Math.round((Math.random() * 60 + 5) * 100) / 100;
        break;
      case "Housing":
        amount = Math.round((Math.random() * 500 + 50) * 100) / 100;
        break;
      case "Healthcare":
        amount = Math.round((Math.random() * 200 + 25) * 100) / 100;
        break;
      case "Entertainment":
        amount = Math.round((Math.random() * 100 + 8) * 100) / 100;
        break;
      case "Shopping":
        amount = Math.round((Math.random() * 200 + 15) * 100) / 100;
        break;
      case "Utilities":
        amount = Math.round((Math.random() * 150 + 30) * 100) / 100;
        break;
      case "Education":
        amount = Math.round((Math.random() * 300 + 25) * 100) / 100;
        break;
      case "Travel":
        amount = Math.round((Math.random() * 800 + 100) * 100) / 100;
        break;
      default:
        amount = Math.round((Math.random() * 100 + 10) * 100) / 100;
    }

    const isAutoClassified = Math.random() > 0.2; // 80% auto-classified
    const isRecurring = Math.random() > 0.8; // 20% recurring
    const hasTags = Math.random() > 0.6; // 40% have tags
    
    let tags: string[] = [];
    if (hasTags) {
      const possibleTags = ["work", "personal", "family", "vacation", "gift", "necessary", "luxury"];
      const numTags = Math.floor(Math.random() * 3) + 1;
      tags = possibleTags.sort(() => 0.5 - Math.random()).slice(0, numTags);
    }

    demoExpenses.push({
      id: i + 1,
      userId: "demo-user",
      amount: amount.toString(),
      description,
      category,
      subcategory: Math.random() > 0.7 ? `${category} Subcategory` : null,
      merchantName: merchant,
      date: expenseDate,
      paymentMethod: Math.random() > 0.5 ? "Credit Card" : "Debit Card",
      isRecurring,
      tags,
      notes: Math.random() > 0.8 ? "Demo expense note" : null,
      isAutoClassified,
      confidence: isAutoClassified ? (Math.round((Math.random() * 30 + 70) * 100) / 100).toString() : null,
      createdAt: expenseDate,
    });
  }

  return demoExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Demo bill split data generator
export function generateDemoBillSplits(): (BillSplit & { participants: BillSplitParticipant[] })[] {
  const billNames = [
    "Dinner at Italian Bistro",
    "Weekend Cabin Rental",
    "Concert Tickets",
    "Grocery Shopping Trip",
    "Pizza Night",
    "Uber to Airport",
    "Birthday Party Supplies",
    "Movie Theater",
    "Gas for Road Trip",
    "Lunch at Sushi Place"
  ];

  const participantNames = [
    "Alex Johnson", "Sarah Chen", "Mike Rodriguez", "Emma Wilson", 
    "David Kim", "Lisa Thompson", "Ryan Martinez", "Jessica Lee",
    "Tom Anderson", "Maria Garcia", "Chris Taylor", "Amanda Brown"
  ];

  const descriptions = [
    "Thanks for a great evening!",
    "Had an amazing time together",
    "Let's do this again soon",
    "Great food and company",
    "Fun night with friends",
    "Shared expenses from our trip",
    "Thanks for organizing everything",
    "Worth every penny!",
    "Good times and good food",
    "Appreciate everyone chipping in"
  ];

  const demoBillSplits: (BillSplit & { participants: BillSplitParticipant[] })[] = [];
  const currentDate = new Date();

  for (let i = 0; i < 8; i++) {
    const name = billNames[i];
    const numParticipants = Math.floor(Math.random() * 4) + 2; // 2-5 participants
    const totalAmount = Math.round((Math.random() * 200 + 30) * 100) / 100; // $30-$230
    const amountPerPerson = totalAmount / numParticipants;
    
    // Generate date in the last 2 months
    const daysAgo = Math.floor(Math.random() * 60);
    const billDate = new Date(currentDate);
    billDate.setDate(billDate.getDate() - daysAgo);

    const selectedParticipants = participantNames
      .sort(() => 0.5 - Math.random())
      .slice(0, numParticipants);

    const participants: BillSplitParticipant[] = selectedParticipants.map((participantName, idx) => {
      const isPaid = Math.random() > 0.4; // 60% chance of being paid
      return {
        id: parseInt(`${i}${idx}`),
        billSplitId: i + 1,
        name: participantName,
        email: `${participantName.toLowerCase().replace(' ', '.')}@email.com`,
        userId: null,
        amountOwed: amountPerPerson.toFixed(2),
        amountPaid: isPaid ? amountPerPerson.toFixed(2) : null,
        isPaid: isPaid ? true : null,
        createdAt: billDate,
      };
    });

    const paidParticipants = participants.filter(p => p.isPaid).length;
    const status: "active" | "settled" = paidParticipants === participants.length ? "settled" : "active";

    demoBillSplits.push({
      id: i + 1,
      createdBy: "demo-user",
      name,
      totalAmount: totalAmount.toString(),
      description: descriptions[i % descriptions.length],
      date: billDate,
      status,
      createdAt: billDate,
      participants
    });
  }

  return demoBillSplits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Helper function to get demo data for specific categories
export function getDemoExpensesByCategory(category: string): Expense[] {
  const allExpenses = generateDemoExpenses();
  return category === "all" ? allExpenses : allExpenses.filter(expense => expense.category === category);
}

// Helper function to get demo bill splits with specific status
export function getDemoBillSplitsByStatus(status?: "active" | "settled"): (BillSplit & { participants: BillSplitParticipant[] })[] {
  const allSplits = generateDemoBillSplits();
  return status ? allSplits.filter(split => split.status === status) : allSplits;
}

// Demo financial goals data generator
export function generateDemoFinancialGoals(): any[] {
  const goalTemplates = [
    {
      name: "Emergency Fund",
      category: "savings",
      targetAmount: 15000,
      currentAmount: 8750,
      targetDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180), // 6 months from now
      description: "6 months of expenses for financial security"
    },
    {
      name: "Down Payment for House",
      category: "home",
      targetAmount: 50000,
      currentAmount: 18500,
      targetDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 730), // 2 years from now
      description: "20% down payment on dream home"
    },
    {
      name: "Retirement Savings",
      category: "retirement",
      targetAmount: 100000,
      currentAmount: 32000,
      targetDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 1825), // 5 years from now
      description: "Building wealth for comfortable retirement"
    },
    {
      name: "Master's Degree Fund",
      category: "education",
      targetAmount: 25000,
      currentAmount: 6200,
      targetDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // 1 year from now
      description: "Funding advanced education without loans"
    },
    {
      name: "Credit Card Payoff",
      category: "debt_repayment",
      targetAmount: 8500,
      currentAmount: 5100,
      targetDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 240), // 8 months from now
      description: "Eliminate high-interest credit card debt"
    },
    {
      name: "Vacation to Europe",
      category: "other",
      targetAmount: 4000,
      currentAmount: 1800,
      targetDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 300), // 10 months from now
      description: "Two-week trip through Italy and France"
    }
  ];

  return goalTemplates.map((goal, index) => ({
    id: index + 1,
    userId: "demo-user",
    ...goal,
    createdAt: new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 30),
    updatedAt: new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 7)
  }));
}

// Demo financial products data generator
export function generateDemoFinancialProducts(): any[] {
  const loans = [
    {
      id: 1,
      name: "Personal Loan - Excellent Credit",
      provider: "LendingClub",
      category: "loans",
      productType: "personal",
      interestRate: 6.99,
      apr: 7.25,
      loanAmount: 25000,
      term: 36,
      monthlyPayment: 776,
      features: ["No origination fee", "Fixed rate", "Quick approval"],
      description: "Perfect for debt consolidation or large purchases",
      minCreditScore: 700,
      maxLoanAmount: 50000
    },
    {
      id: 2,
      name: "Home Improvement Loan",
      provider: "Wells Fargo",
      category: "loans",
      productType: "home_improvement",
      interestRate: 8.49,
      apr: 8.95,
      loanAmount: 15000,
      term: 60,
      monthlyPayment: 304,
      features: ["No collateral required", "Fixed rate", "Tax benefits possible"],
      description: "Upgrade your home with competitive rates",
      minCreditScore: 650,
      maxLoanAmount: 100000
    },
    {
      id: 3,
      name: "Auto Loan - New Car",
      provider: "Chase Bank",
      category: "loans",
      productType: "auto",
      interestRate: 4.99,
      apr: 5.15,
      loanAmount: 30000,
      term: 60,
      monthlyPayment: 566,
      features: ["New car rates", "Quick pre-approval", "No prepayment penalty"],
      description: "Competitive rates for new vehicle purchases",
      minCreditScore: 680,
      maxLoanAmount: 80000
    }
  ];

  const creditCards = [
    {
      id: 4,
      name: "Cashback Rewards Card",
      provider: "Capital One",
      category: "credit_cards",
      productType: "cashback",
      interestRate: 19.99,
      apr: 19.99,
      annualFee: 0,
      creditLimit: 5000,
      features: ["1.5% cash back", "No annual fee", "0% intro APR 15 months"],
      description: "Earn cash back on every purchase",
      minCreditScore: 600,
      rewardsRate: 1.5
    },
    {
      id: 5,
      name: "Travel Rewards Premium Card",
      provider: "American Express",
      category: "credit_cards",
      productType: "travel",
      interestRate: 22.99,
      apr: 22.99,
      annualFee: 95,
      creditLimit: 10000,
      features: ["2x points on travel", "Airport lounge access", "Travel insurance"],
      description: "Maximize rewards on travel and dining",
      minCreditScore: 720,
      rewardsRate: 2.0
    },
    {
      id: 6,
      name: "Balance Transfer Card",
      provider: "Citi Bank",
      category: "credit_cards",
      productType: "balance_transfer",
      interestRate: 17.99,
      apr: 17.99,
      annualFee: 0,
      creditLimit: 8000,
      features: ["0% APR 18 months", "No balance transfer fee", "No annual fee"],
      description: "Consolidate and pay off debt faster",
      minCreditScore: 650,
      introRate: 0
    }
  ];

  const savings = [
    {
      id: 7,
      name: "High-Yield Savings Account",
      provider: "Marcus by Goldman Sachs",
      category: "savings",
      productType: "savings",
      interestRate: 4.75,
      apr: 4.75,
      minimumBalance: 0,
      features: ["No minimum balance", "No monthly fees", "FDIC insured"],
      description: "Earn more on your savings with competitive rates",
      monthlyFee: 0,
      maxBalance: 250000
    },
    {
      id: 8,
      name: "Certificate of Deposit 12-Month",
      provider: "Ally Bank",
      category: "savings",
      productType: "cd",
      interestRate: 5.25,
      apr: 5.25,
      minimumBalance: 1000,
      term: 12,
      features: ["Guaranteed return", "FDIC insured", "Competitive rates"],
      description: "Lock in high rates for guaranteed growth",
      monthlyFee: 0,
      penaltyFee: "3 months interest"
    },
    {
      id: 9,
      name: "Money Market Account",
      provider: "Discover Bank",
      category: "savings",
      productType: "money_market",
      interestRate: 4.35,
      apr: 4.35,
      minimumBalance: 2500,
      features: ["Check writing", "Debit card access", "Tiered interest rates"],
      description: "Savings with easy access to your money",
      monthlyFee: 0,
      maxTransactions: 6
    }
  ];

  const insurance = [
    {
      id: 10,
      name: "Term Life Insurance",
      provider: "State Farm",
      category: "insurance",
      productType: "life",
      coverage: 500000,
      monthlyPremium: 42,
      term: 20,
      features: ["Level premiums", "Convertible to permanent", "Fast underwriting"],
      description: "Protect your family's financial future",
      ageRange: "25-45",
      medicalExam: "Required"
    },
    {
      id: 11,
      name: "Auto Insurance - Full Coverage",
      provider: "GEICO",
      category: "insurance",
      productType: "auto",
      coverage: 250000,
      monthlyPremium: 125,
      features: ["Comprehensive coverage", "24/7 claims", "Roadside assistance"],
      description: "Complete protection for your vehicle",
      deductible: 500,
      discounts: ["Multi-car", "Good driver", "Safety features"]
    },
    {
      id: 12,
      name: "Homeowners Insurance",
      provider: "Allstate",
      category: "insurance",
      productType: "home",
      coverage: 350000,
      monthlyPremium: 150,
      features: ["Dwelling protection", "Personal property", "Liability coverage"],
      description: "Comprehensive home and property protection",
      deductible: 1000,
      coverageTypes: ["Fire", "Theft", "Weather", "Liability"]
    }
  ];

  return [...loans, ...creditCards, ...savings, ...insurance];
}

// Demo credit score data
export function generateDemoCreditScore(): any {
  return {
    score: 742,
    range: "Good",
    factors: {
      paymentHistory: { score: 85, impact: "Good" },
      creditUtilization: { score: 72, impact: "Fair" },
      creditAge: { score: 90, impact: "Excellent" },
      creditMix: { score: 80, impact: "Good" },
      newCredit: { score: 95, impact: "Excellent" }
    },
    utilization: "Average",
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 1 week ago
    trend: "improving",
    recommendations: [
      "Pay down credit card balances to reduce utilization",
      "Continue making on-time payments",
      "Avoid opening new credit accounts"
    ]
  };
}

// Demo insurance risk data
export function generateDemoInsuranceRisk(): any {
  return {
    overallRisk: "Low",
    autoRisk: "Low",
    homeRisk: "Low",
    healthRisk: "Medium",
    lifeInsuranceNeed: "High",
    factors: {
      age: { value: 32, impact: "Low" },
      creditScore: { value: 742, impact: "Low" },
      location: { value: "Suburban", impact: "Low" },
      drivingRecord: { value: "Clean", impact: "Low" },
      homeOwnership: { value: "Owner", impact: "Medium" }
    },
    recommendations: [
      "Consider increasing life insurance coverage",
      "Review auto insurance deductibles",
      "Maintain good credit for better rates"
    ],
    lastAssessment: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14) // 2 weeks ago
  };
}

// Helper functions for filtered data
export function getDemoFinancialProductsByCategory(category: string): any[] {
  const allProducts = generateDemoFinancialProducts();
  return allProducts.filter(product => product.category === category);
}
