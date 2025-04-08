import { useEffect, useState } from "react";
import { useAuth } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { getBankConnections } from "@/lib/api";
import { useLocation } from "wouter";
import ProgressIndicator from "@/components/ProgressIndicator";
import BankConnectionCard from "@/components/BankConnectionCard";
import { Button } from "@/components/ui/button";
import { 
  CreditCard, 
  Building2, 
  PiggyBank, 
  BadgeDollarSign,
  Landmark,
  Building,
  ChevronsDown
} from "lucide-react";

// Available banks for connection
const availableBanks = [
  {
    id: 1,
    name: "Chase Bank",
    icon: <Landmark className="h-8 w-8 text-gray-600" />,
    description: "Connect your accounts to analyze your credit profile."
  },
  {
    id: 2,
    name: "Bank of America",
    icon: <CreditCard className="h-8 w-8 text-gray-600" />,
    description: "Connect your accounts to analyze your credit profile."
  },
  {
    id: 3,
    name: "Wells Fargo",
    icon: <PiggyBank className="h-8 w-8 text-gray-600" />,
    description: "Connect your accounts to analyze your credit profile."
  },
  {
    id: 4,
    name: "Citibank",
    icon: <Building2 className="h-8 w-8 text-gray-600" />,
    description: "Connect your accounts to analyze your credit profile."
  },
  {
    id: 5,
    name: "Capital One",
    icon: <BadgeDollarSign className="h-8 w-8 text-gray-600" />,
    description: "Connect your accounts to analyze your credit profile."
  },
  {
    id: 6,
    name: "US Bank",
    icon: <Building className="h-8 w-8 text-gray-600" />,
    description: "Connect your accounts to analyze your credit profile."
  }
];

export default function Onboarding() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [showAll, setShowAll] = useState(false);
  
  // Steps for onboarding process
  const steps = [
    { id: 1, label: "Connect", isActive: true, isCompleted: false },
    { id: 2, label: "Analyze", isActive: false, isCompleted: false },
    { id: 3, label: "Compare", isActive: false, isCompleted: false },
    { id: 4, label: "Plan", isActive: false, isCompleted: false }
  ];

  // Check if user has connected banks
  const { data: bankConnections } = useQuery({
    queryKey: ["/api/bank-connections"],
    enabled: isAuthenticated,
    refetchInterval: 3000, // Refresh every 3 seconds to check for connections
  });

  // Redirect to dashboard if connections are found
  useEffect(() => {
    if (bankConnections && bankConnections.length > 0) {
      navigate("/dashboard");
    }
  }, [bankConnections, navigate]);

  // Display only 3 banks initially
  const displayedBanks = showAll ? availableBanks : availableBanks.slice(0, 3);

  return (
    <div id="onboarding-section" className="mb-12">
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 font-sans">Welcome to FinHealth</h2>
        <p className="text-gray-600 mb-6">
          Connect your financial accounts to get your personalized credit score and discover financial products tailored to your needs.
        </p>
        
        <ProgressIndicator steps={steps} />
        
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayedBanks.map((bank) => (
            <BankConnectionCard
              key={bank.id}
              bankName={bank.name}
              bankLogo={bank.icon}
              description={bank.description}
            />
          ))}
        </div>
        
        <div className="text-center mt-8">
          <Button
            variant="outline"
            className="text-gray-500 bg-gray-100 hover:bg-gray-200"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "Show Less Options" : "Show More Options"}
            {!showAll && <ChevronsDown className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
