import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  ArrowLeftRight,
  BarChart3,
  Activity,
  Store,
  Target,
  Bell,
  Lock,
  CheckCircle2,
  Landmark,
  CreditCard,
  Banknote,
  Wallet,
  Home,
  PiggyBank,
  TrendingUp,
  Shield,
  DollarSign,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { Analytics } from "@/lib/analytics";
import { useTranslation } from "react-i18next";

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation(ROUTES.panel);
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
              {t("landing.heroTitle")}{" "}
              <span className="text-blue-200">{t("landing.heroTitleHighlight")}</span>
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-8 leading-relaxed">
              {t("landing.heroSubtitle")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href={ROUTES.registro}>
                <Button
                  size="lg"
                  className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-8 py-6 text-lg"
                  onClick={() => Analytics.signupStarted()}
                >
                  {t("landing.getStarted")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="outline" className="border-2 border-white bg-transparent !text-white hover:bg-white hover:!text-blue-700 transition-colors px-8 py-6 text-lg">
                  {t("landing.learnMore")}
                </Button>
              </a>
            </div>
            <p className="mt-6 text-blue-200 text-sm">
              {t("landing.noPaymentRequired")}
            </p>
          </div>
        </div>
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
              {t("landing.featuresTitle")}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t("landing.featuresSubtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<BarChart3 className="h-8 w-8" />}
              title={t("landing.feature1Title")}
              description={t("landing.feature1Desc")}
              color="blue"
            />
            <FeatureCard
              icon={<Activity className="h-8 w-8" />}
              title={t("landing.feature2Title")}
              description={t("landing.feature2Desc")}
              color="green"
            />
            <FeatureCard
              icon={<Store className="h-8 w-8" />}
              title={t("landing.feature3Title")}
              description={t("landing.feature3Desc")}
              color="purple"
            />
            <FeatureCard
              icon={<Target className="h-8 w-8" />}
              title={t("landing.feature4Title")}
              description={t("landing.feature4Desc")}
              color="orange"
            />
            <FeatureCard
              icon={<Bell className="h-8 w-8" />}
              title={t("landing.feature5Title")}
              description={t("landing.feature5Desc")}
              color="pink"
            />
            <FeatureCard
              icon={<Lock className="h-8 w-8" />}
              title={t("landing.feature6Title")}
              description={t("landing.feature6Desc")}
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
              {t("landing.howItWorksTitle")}
            </h2>
            <p className="text-xl text-gray-600">
              {t("landing.howItWorksSubtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <StepCard number="1" title={t("landing.step1Title")} description={t("landing.step1Desc")} />
            <StepCard number="2" title={t("landing.step2Title")} description={t("landing.step2Desc")} />
            <StepCard number="3" title={t("landing.step3Title")} description={t("landing.step3Desc")} />
          </div>
        </div>
      </section>

      {/* Product Categories Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t("landing.categoriesTitle")}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t("landing.categoriesSubtitle")}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
            <CategoryCard icon={<Landmark className="h-6 w-6" />} title={t("landing.catCuentas")} desc={t("landing.catCuentasDesc")} />
            <CategoryCard icon={<CreditCard className="h-6 w-6" />} title={t("landing.catTarjetas")} desc={t("landing.catTarjetasDesc")} />
            <CategoryCard icon={<Banknote className="h-6 w-6" />} title={t("landing.catCreditos")} desc={t("landing.catCreditosDesc")} />
            <CategoryCard icon={<Wallet className="h-6 w-6" />} title={t("landing.catLineas")} desc={t("landing.catLineasDesc")} />
            <CategoryCard icon={<Home className="h-6 w-6" />} title={t("landing.catHipotecarios")} desc={t("landing.catHipotecariosDesc")} />
            <CategoryCard icon={<PiggyBank className="h-6 w-6" />} title={t("landing.catDepositos")} desc={t("landing.catDepositosDesc")} />
            <CategoryCard icon={<TrendingUp className="h-6 w-6" />} title={t("landing.catFondos")} desc={t("landing.catFondosDesc")} />
            <CategoryCard icon={<Shield className="h-6 w-6" />} title={t("landing.catSeguros")} desc={t("landing.catSegurosDesc")} />
            <CategoryCard icon={<Target className="h-6 w-6" />} title={t("landing.catAPV")} desc={t("landing.catAPVDesc")} />
            <CategoryCard icon={<ArrowLeftRight className="h-6 w-6" />} title={t("landing.catPortabilidad")} desc={t("landing.catPortabilidadDesc")} />
          </div>
        </div>
      </section>

      {/* Why CODA Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {t("landing.whyChooseTitle")}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <WhyCard
              icon={<DollarSign className="h-6 w-6 text-green-600" />}
              title={t("landing.whyFreeTitle")}
              description={t("landing.whyFreeDesc")}
            />
            <WhyCard
              icon={<BarChart3 className="h-6 w-6 text-blue-600" />}
              title={t("landing.whyRealDataTitle")}
              description={t("landing.whyRealDataDesc")}
            />
            <WhyCard
              icon={<Shield className="h-6 w-6 text-purple-600" />}
              title={t("landing.whyNeutralTitle")}
              description={t("landing.whyNeutralDesc")}
            />
            <WhyCard
              icon={<Landmark className="h-6 w-6 text-indigo-600" />}
              title={t("landing.whyRegulatedTitle")}
              description={t("landing.whyRegulatedDesc")}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t("landing.ctaTitle")}
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            {t("landing.ctaSubtitle")}
          </p>
          <Link href={ROUTES.registro}>
            <Button
              size="lg"
              className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-8 py-6 text-lg"
              onClick={() => Analytics.signupStarted()}
            >
              {t("landing.createAccount")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

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

function CategoryCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="group rounded-xl border border-gray-200 bg-white/80 p-4 text-center hover:shadow-md hover:border-blue-200 transition-all duration-200">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
        {icon}
      </div>
      <h4 className="text-sm font-semibold text-gray-900 mb-1">{title}</h4>
      <p className="text-xs text-gray-500">{desc}</p>
    </div>
  );
}

function WhyCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 p-6 rounded-xl bg-white shadow-sm border border-gray-100">
      <div className="flex-shrink-0 mt-1">{icon}</div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-gray-600 text-sm">{description}</p>
      </div>
    </div>
  );
}
