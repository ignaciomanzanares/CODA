// Insurance risk utility functions

export function calculateRiskRingDashoffset(riskLevel: string): number {
  const circumference = 2 * Math.PI * 70;
  
  let percentage = 0.5; // Medium by default
  
  if (riskLevel === "Low") {
    percentage = 0.25; // Less offset means more of the circle is filled
  } else if (riskLevel === "High") {
    percentage = 0.75; // More offset means less of the circle is filled
  }
  
  return circumference * percentage;
}

export function getRiskColor(riskLevel: string): string {
  switch (riskLevel) {
    case "Low":
      return "#4CAF50"; // Success green
    case "Medium":
      return "#FF9800"; // Warning orange
    case "High":
      return "#F44336"; // Error red
    default:
      return "#757575"; // Neutral gray
  }
}

export function getRiskTextColor(riskLevel: string): string {
  switch (riskLevel) {
    case "Low":
      return "text-green-500";
    case "Medium":
      return "text-yellow-500";
    case "High":
      return "text-red-500";
    default:
      return "text-neutral-500";
  }
}

export function getRiskBackgroundColor(riskLevel: string): string {
  switch (riskLevel) {
    case "Low":
      return "bg-green-500 bg-opacity-10";
    case "Medium":
      return "bg-yellow-500 bg-opacity-10";
    case "High":
      return "bg-red-500 bg-opacity-10";
    default:
      return "bg-neutral-500 bg-opacity-10";
  }
}
