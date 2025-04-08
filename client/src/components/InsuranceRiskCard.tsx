import { useQuery, useMutation } from "@tanstack/react-query";
import { useInsuranceRisk } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ProgressRing from "./ProgressRing";
import { 
  getRiskColor, 
  getRiskTextColor, 
  calculateRiskRingDashoffset,
  getRiskBackgroundColor
} from "@/lib/insuranceRisk";

export default function InsuranceRiskCard() {
  const { getInsuranceRisk, refreshInsuranceRisk } = useInsuranceRisk();
  
  const { data: insuranceRisk, isLoading, error } = useQuery({
    queryKey: ["/api/insurance-risk"],
    queryFn: getInsuranceRisk
  });

  const mutation = useMutation({
    mutationFn: refreshInsuranceRisk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurance-risk"] });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-bold">Insurance Risk</h3>
            <Skeleton className="h-6 w-16" />
          </div>
          <div className="flex justify-center mb-4">
            <Skeleton className="h-40 w-40 rounded-full" />
          </div>
          <div className="grid grid-cols-3 text-center text-xs border-t border-gray-200 pt-4">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <Skeleton className="h-4 w-20 mx-auto mb-2" />
                <Skeleton className="h-4 w-16 mx-auto" />
              </div>
            ))}
          </div>
          <Skeleton className="h-10 w-full mt-6" />
        </CardContent>
      </Card>
    );
  }

  if (error || !insuranceRisk) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-bold mb-4">Insurance Risk</h3>
          <div className="text-center py-8">
            <p className="text-red-500">
              {error instanceof Error
                ? error.message
                : "Failed to load insurance risk assessment. Please connect a bank account first."}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/insurance-risk"] })}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Convert risk level to progress percentage
  let progress = 50; // Default medium
  if (insuranceRisk.riskLevel === "Low") {
    progress = 75;
  } else if (insuranceRisk.riskLevel === "High") {
    progress = 25;
  }

  const riskColor = getRiskColor(insuranceRisk.riskLevel);
  const riskTextColor = getRiskTextColor(insuranceRisk.riskLevel);
  const badgeClass = getRiskBackgroundColor(insuranceRisk.riskLevel);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold">Insurance Risk</h3>
          <Badge 
            variant="outline" 
            className={`${badgeClass} ${riskTextColor} px-2 py-1 rounded text-xs font-medium`}
          >
            {insuranceRisk.riskLevel}
          </Badge>
        </div>

        <div className="flex justify-center">
          <ProgressRing progress={progress} color={riskColor}>
            <div className="text-xl font-bold text-gray-900">
              {insuranceRisk.riskLevel}
            </div>
            <div className="text-xs text-gray-500">Risk Level</div>
          </ProgressRing>
        </div>

        <div className="mt-4">
          <div className="grid grid-cols-3 text-center text-xs border-t border-gray-200 pt-4">
            <div>
              <div className="font-medium text-gray-500">Health</div>
              <div className={`font-bold ${getRiskTextColor(insuranceRisk.healthRisk)} mt-1`}>
                {insuranceRisk.healthRisk} Risk
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-500">Property</div>
              <div className={`font-bold ${getRiskTextColor(insuranceRisk.propertyRisk)} mt-1`}>
                {insuranceRisk.propertyRisk}
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-500">Auto</div>
              <div className={`font-bold ${getRiskTextColor(insuranceRisk.autoRisk)} mt-1`}>
                {insuranceRisk.autoRisk}
              </div>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          className="mt-6 w-full"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Calculating..." : "View Insurance Options"}
        </Button>
      </CardContent>
    </Card>
  );
}
