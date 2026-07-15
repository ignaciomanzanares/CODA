// Credit score utility functions

export function calculateCreditScoreCircleDashoffset(
  score: number,
  maxScore: number = 850,
): number {
  const circumference = 2 * Math.PI * 70;
  const percentage = score / maxScore;
  return circumference - circumference * percentage;
}

export function getCreditScoreStatus(score: number): {
  label: string;
  color: string;
} {
  if (score >= 800) {
    return { label: "Excelente", color: "text-green-500" };
  } else if (score >= 740) {
    return { label: "Muy bueno", color: "text-green-500" };
  } else if (score >= 670) {
    return { label: "Bueno", color: "text-green-500" };
  } else if (score >= 580) {
    return { label: "Regular", color: "text-yellow-500" };
  } else {
    return { label: "Bajo", color: "text-red-500" };
  }
}

export function getCreditFactorColor(factor: string): string {
  switch (factor) {
    case "Excelente":
    case "Excellent":
      return "text-green-500";
    case "Bueno":
    case "Good":
      return "text-green-500";
    case "Regular":
    case "Average":
    case "Fair":
      return "text-yellow-500";
    case "Bajo":
    case "Poor":
      return "text-red-500";
    default:
      return "text-neutral-500";
  }
}

export function getCircleColor(score: number): string {
  if (score >= 740) {
    return "#4CAF50";
  } else if (score >= 670) {
    return "#4CAF50";
  } else if (score >= 580) {
    return "#FF9800";
  } else {
    return "#F44336";
  }
}
