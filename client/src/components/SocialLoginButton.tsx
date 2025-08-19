import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SocialLoginButtonProps {
  provider: "google" | "apple" | "email";
  className?: string;
}

export default function SocialLoginButton({ provider, className }: SocialLoginButtonProps) {
  const { loginWithRedirect, isLoading } = useAuth0();

  const handleSocialLogin = (connection?: string) => {
    loginWithRedirect({
      authorizationParams: {
        connection: connection,
        redirect_uri: window.location.origin,
        audience: "https://finhealth-api"
      }
    });
  };

  const providers = {
    google: {
      name: "Google",
      icon: (
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      ),
      connection: "google-oauth2",
      className: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
    },
    apple: {
      name: "Apple",
      icon: (
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.017 0C8.596 0 8.017 3.652 8.017 4.873c0 1.917 1.525 3.417 3.658 3.417.133-.003.266-.009.399-.024C12.016 8.129 12.017 8.019 12.017 7.822c0-1.917-1.525-3.417-3.658-3.417-.133.003-.266.009-.399.024.058-.137.017-.247.017-.404C8.017 2.652 8.596 0 12.017 0zm11.466 14.058c-.24.731-.506 1.381-.793 1.951-.287.57-.604 1.069-.949 1.497-.345.428-.73.791-1.156 1.089-.426.298-.893.517-1.4.658-.507.14-1.054.182-1.642.123-.588-.059-1.216-.237-1.883-.536-.667-.298-1.375-.717-2.124-1.257-.749-.54-1.539-1.201-2.37-1.984-.831-.783-1.703-1.688-2.615-2.715-.912-1.027-1.864-2.175-2.857-3.444-.993-1.269-2.027-2.66-3.102-4.173C1.165 3.747.149 2.195-.88.603c-.137-.212-.137-.424 0-.636C.137-.245.149-.457.012-.669c1.029-1.592 2.045-3.144 3.048-4.656.993-1.513 2.027-2.904 3.102-4.173.993-1.269 2.045-2.417 2.957-3.444.912-1.027 1.784-1.932 2.615-2.715.831-.783 1.621-1.444 2.37-1.984.749-.54 1.457-.959 2.124-1.257.667-.299 1.295-.477 1.883-.536.588-.059 1.135-.017 1.642.123.507.14.974.36 1.4.658.426.298.811.661 1.156 1.089.345.428.662.927.949 1.497.287.57.553 1.22.793 1.951z"/>
        </svg>
      ),
      connection: "apple",
      className: "bg-black text-white hover:bg-gray-800"
    },
    email: {
      name: "Email",
      icon: (
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      connection: undefined, // Default Auth0 connection
      className: "bg-blue-600 text-white hover:bg-blue-700"
    }
  };

  const config = providers[provider];

  return (
    <Button
      onClick={() => handleSocialLogin(config.connection)}
      disabled={isLoading}
      className={cn(
        "w-full flex items-center justify-center py-2 px-4 rounded-md text-sm font-medium transition-colors",
        config.className,
        className
      )}
    >
      {isLoading ? (
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div>
      ) : (
        config.icon
      )}
      Continue with {config.name}
    </Button>
  );
}
