import { useQuery, useMutation } from "@tanstack/react-query";
import { useCreditScore } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ProgressRing from "./ProgressRing";
import { 
  getCreditScoreStatus, 
  getCreditFactorColor,
  getCircleColor
} from "@/lib/creditScore";

export default function CreditScoreCard() {
  const { getCreditScore, refreshCreditScore } = useCreditScore();

  const { data: creditScore, isLoading, error } = useQuery({
    queryKey: ["/api/credit-score"],
    queryFn: getCreditScore
  });

  const mutation = useMutation({
    mutationFn: refreshCreditScore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-bold">Credit Score</h3>
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

  if (error || !creditScore) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-bold mb-4">Credit Score</h3>
          <div className="text-center py-8">
            <p className="text-red-500">
              {error instanceof Error
                ? error.message
                : "Failed to load credit score. Please connect a bank account first."}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/credit-score"] })}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const scoreStatus = getCreditScoreStatus(creditScore.score);
  const circleColor = getCircleColor(creditScore.score);
  const progress = (creditScore.score / creditScore.maxScore) * 100;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold">Credit Score</h3>
          <Badge 
            variant="outline" 
            className={`${scoreStatus.color} bg-opacity-10 px-2 py-1 rounded text-xs font-medium`}
          >
            {scoreStatus.label}
          </Badge>
        </div>

        <div className="flex justify-center">
          <ProgressRing progress={progress} color={circleColor}>
            <div className="text-4xl font-bold text-gray-900">
              {creditScore.score}
            </div>
            <div className="text-xs text-gray-500">
              out of {creditScore.maxScore}
            </div>
          </ProgressRing>
        </div>

        <div className="mt-4">
          <div className="grid grid-cols-3 text-center text-xs border-t border-gray-200 pt-4">
            <div>
              <div className="font-medium text-gray-500">Payment History</div>
              <div className={`font-bold ${getCreditFactorColor(creditScore.paymentHistory)} mt-1`}>
                {creditScore.paymentHistory}
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-500">Utilization</div>
              <div className={`font-bold ${getCreditFactorColor(creditScore.utilization)} mt-1`}>
                {creditScore.utilization}
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-500">Age of Credit</div>
              <div className={`font-bold ${getCreditFactorColor(creditScore.ageOfCredit)} mt-1`}>
                {creditScore.ageOfCredit}
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
          {mutation.isPending ? "Updating..." : "View Detailed Report"}
        </Button>
      </CardContent>
    </Card>
  );
}
