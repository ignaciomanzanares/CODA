import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { ReactNode } from "react";

interface RecommendationCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionText: string;
  actionLink: string;
}

export default function RecommendationCard({
  icon,
  title,
  description,
  actionText,
  actionLink
}: RecommendationCardProps) {
  return (
    <div className="border border-border rounded-lg p-4 hover:border-primary transition-colors">
      <div className="flex items-start">
        <div className="bg-primary bg-opacity-10 p-2 rounded-full mr-4 text-primary">
          {icon}
        </div>
        <div>
          <h4 className="font-bold mb-1 font-sans">{title}</h4>
          <p className="text-muted-foreground text-sm mb-2">{description}</p>
          <Link href={actionLink}>
            <button className="text-primary text-sm font-medium flex items-center">
              {actionText}
              <ArrowRight className="text-sm ml-1 h-4 w-4" />
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
