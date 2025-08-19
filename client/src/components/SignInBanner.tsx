import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Info, User } from "lucide-react";

interface SignInBannerProps {
  title: string;
  description: string;
  actionText?: string;
}

export default function SignInBanner({ 
  title, 
  description, 
  actionText = "Sign In to Get Started" 
}: SignInBannerProps) {
  const { loginWithRedirect } = useAuth0();

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-1">{title}</h3>
            <p className="text-blue-700 text-sm mb-3">
              {description}
            </p>
            <Button 
              onClick={() => loginWithRedirect()}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <User className="w-4 h-4 mr-2" />
              {actionText}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
