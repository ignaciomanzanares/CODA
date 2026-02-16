import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  BarChart3,
  CreditCard,
  PiggyBank,
  Shield,
  Split,
  Target,
  TrendingUp,
  Wallet,
  CheckCircle2,
} from "lucide-react";

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="container mx-auto px-4 py-20 md:py-32 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Take Control of Your{" "}
              <span className="text-blue-200">Financial Future</span>
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-8 leading-relaxed">
              AI-powered insights to track spending, analyze risk, split bills with friends, and reach your financial goals faster.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-8 py-6 text-lg">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/about">
                <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white hover:text-blue-700 transition-colors px-8 py-6 text-lg">
                  Conoce Más
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-blue-200 text-sm">
              No payment required. Start in seconds.
            </p>
          </div>
        </div>
        {/* Wave decoration */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 37.5C840 45 960 60 1080 67.5C1200 75 1320 75 1380 75L1440 75V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Manage Your Money
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Powerful tools to understand your finances, reduce risk, and build wealth.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<BarChart3 className="h-8 w-8" />}
              title="Smart Dashboard"
              description="Get a complete overview of your finances with real-time insights and beautiful visualizations."
              color="blue"
            />
            <FeatureCard
              icon={<Shield className="h-8 w-8" />}
              title="Risk Analysis"
              description="AI-powered credit score and insurance risk assessment to help you make informed decisions."
              color="green"
            />
            <FeatureCard
              icon={<Split className="h-8 w-8" />}
              title="Bill Splitting"
              description="Split expenses with friends and family effortlessly. Share via link or email."
              color="purple"
            />
            <FeatureCard
              icon={<Wallet className="h-8 w-8" />}
              title="Expense Tracking"
              description="Categorize and track all your spending automatically. Know where every peso goes."
              color="orange"
            />
            <FeatureCard
              icon={<Target className="h-8 w-8" />}
              title="Financial Goals"
              description="Set savings goals and track your progress. Achieve your dreams faster."
              color="pink"
            />
            <FeatureCard
              icon={<CreditCard className="h-8 w-8" />}
              title="Product Comparison"
              description="Compare financial products and find the best rates for loans, cards, and more."
              color="cyan"
            />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-xl text-gray-600">
              Three simple steps to financial clarity
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <StepCard
              number="1"
              title="Connect"
              description="Securely link your bank accounts or use demo data to explore."
            />
            <StepCard
              number="2"
              title="Analyze"
              description="Get instant insights into your spending patterns and financial health."
            />
            <StepCard
              number="3"
              title="Optimize"
              description="Follow personalized recommendations to improve your finances."
            />
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Why Choose CODA?
              </h2>
              <div className="space-y-4">
                <BenefitItem text="Free to use with no hidden fees" />
                <BenefitItem text="Bank-level security for your data" />
                <BenefitItem text="AI-powered insights and recommendations" />
                <BenefitItem text="Split bills with anyone, even non-users" />
                <BenefitItem text="Beautiful, intuitive interface" />
                <BenefitItem text="Works on any device" />
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl p-8">
                <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total Balance</span>
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  </div>
                  <div className="text-3xl font-bold text-gray-900">$15.450.000</div>
                  <div className="text-sm text-green-600">+$780.000 this month</div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full w-3/4 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <div className="text-sm text-gray-500">Savings Rate</div>
                      <div className="text-lg font-semibold text-gray-900">28%</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Net Worth</div>
                      <div className="text-lg font-semibold text-gray-900">$89.500.000</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Transform Your Finances?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of users who are already making smarter financial decisions with CODA.
          </p>
          <Link href="/login">
            <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-8 py-6 text-lg">
              Start Your Free Account
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

// Feature Card Component
function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    orange: "bg-orange-100 text-orange-600",
    pink: "bg-pink-100 text-pink-600",
    cyan: "bg-cyan-100 text-cyan-600",
  };

  return (
    <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardContent className="p-6">
        <div className={`w-14 h-14 rounded-xl ${colorClasses[color]} flex items-center justify-center mb-4`}>
          {icon}
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </CardContent>
    </Card>
  );
}

// Step Card Component
function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-full bg-blue-600 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-4">
        {number}
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

// Benefit Item Component
function BenefitItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
      <span className="text-gray-700">{text}</span>
    </div>
  );
}
