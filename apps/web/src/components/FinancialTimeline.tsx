import { CheckCircle, Clock, ArrowRight } from "lucide-react";

interface TimelineGoal {
  id: number | string;
  name: string;
  status: string; // 'completed', 'in_progress', 'not_started'
  timeframe: string; // 'now', 'next (3-6 months)', '6-12 months', '1-2 years'
  progress: number;
}

interface FinancialTimelineProps {
  goals: TimelineGoal[];
}

export default function FinancialTimeline({ goals }: FinancialTimelineProps) {
  // Function to get icon based on status
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-white" />;
      case "in_progress":
        return <ArrowRight className="h-4 w-4 text-white" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Function to get background color based on status
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "in_progress":
        return "bg-primary";
      default:
        return "bg-muted";
    }
  };

  // Function to get time period label
  const getTimeLabel = (timeframe: string) => {
    switch (timeframe) {
      case "now":
        return "Now";
      case "next (3-6 months)":
        return "Next (3-6 months)";
      case "6-12 months":
        return "6-12 months";
      case "1-2 years":
        return "1-2 years";
      default:
        return timeframe;
    }
  };

  return (
    <div className="space-y-6">
      {goals.map((goal, index) => (
        <div key={goal.id} className="relative pl-8">
          {/* Vertical line connecting timeline items */}
          {index < goals.length - 1 && (
            <div className="absolute left-0 top-0 h-full w-px bg-muted"></div>
          )}
          
          {/* Timeline dot */}
          <div className={`absolute left-0 top-1 w-6 h-6 rounded-full ${getStatusColor(goal.status)} flex items-center justify-center`}>
            {getStatusIcon(goal.status)}
          </div>
          
          <div>
            <div className="text-sm font-medium text-muted-foreground">{getTimeLabel(goal.timeframe)}</div>
            <div className="font-bold mb-1">{goal.name}</div>
            <div className="text-muted-foreground text-xs">{goal.progress}% Complete</div>
          </div>
        </div>
      ))}
    </div>
  );
}
