// Credit score utility functions

export function calculateCreditScoreCircleDashoffset(score: number, maxScore: number = 850): number {
  const circumference = 2 * Math.PI * 70;
  const percentage = score / maxScore;
  return circumference - (circumference * percentage);
}

export function getCreditScoreStatus(score: number): {
  label: string;
  color: string;
} {
  if (score >= 800) {
    return { label: "Excellent", color: "text-green-500" };
  } else if (score >= 740) {
    return { label: "Very Good", color: "text-green-500" };
  } else if (score >= 670) {
    return { label: "Good", color: "text-green-500" };
  } else if (score >= 580) {
    return { label: "Fair", color: "text-yellow-500" };
  } else {
    return { label: "Poor", color: "text-red-500" };
  }
}

export function getCreditFactorColor(factor: string): string {
  switch (factor) {
    case "Excellent":
      return "text-green-500";
    case "Good":
      return "text-green-500";
    case "Average":
      return "text-yellow-500";
    case "Poor":
      return "text-red-500";
    default:
      return "text-neutral-500";
  }
}

export function getCircleColor(score: number): string {
  if (score >= 740) {
    return "#4CAF50"; // Success green
  } else if (score >= 670) {
    return "#4CAF50"; // Success green
  } else if (score >= 580) {
    return "#FF9800"; // Warning orange
  } else {
    return "#F44336"; // Error red
  }
}
