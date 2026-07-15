import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Users, DollarSign, CheckCircle, UserPlus, LogIn } from "lucide-react";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";

interface InvitationCheckResult {
  userExists: boolean;
  billSplitName: string;
  invitedEmail: string;
  billSplitId: number;
}

export default function EmailInviteHandler() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [checkResult, setCheckResult] = useState<InvitationCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    const checkInvitation = async () => {
      // Get URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const billSplitId = urlParams.get("billId");
      const email = urlParams.get("email");

      if (!billSplitId || !email) {
        setError("Invalid invitation link. Missing required information.");
        setIsChecking(false);
        return;
      }

      try {
        // Check if user exists for this invitation
        const result = await apiFetch(
          `/api/bill-splits/${billSplitId}/check-user/${encodeURIComponent(email)}`,
        );

        const finalResult = {
          userExists: !!result?.userExists,
          billSplitName: result?.billSplitName || "Demo Bill Split",
          invitedEmail: result?.invitedEmail || email,
          billSplitId: result?.billSplitId ? Number(result.billSplitId) : parseInt(billSplitId),
        } as InvitationCheckResult;

        setCheckResult(finalResult);

        // Handle different scenarios based on user existence and authentication status
        if (finalResult.userExists) {
          // User has an account
          if (isAuthenticated) {
            // User has account and is logged in -> go to bill split
            setLocation(`${ROUTES.dividirCuenta}?highlight=${billSplitId}`);
            return;
          } else {
            // User has account but is not logged in -> redirect to login
            setIsRedirecting(true);
            // Store the intended destination for after login
            localStorage.setItem(
              "redirectAfterLogin",
              `${ROUTES.dividirCuenta}?highlight=${billSplitId}`,
            );
            setTimeout(() => {
              setLocation(ROUTES.iniciarSesion);
            }, 1500); // Show message for 1.5 seconds before redirecting
            return;
          }
        } else {
          // User doesn't have an account -> show invitation page with options
          // (This will fall through to render the invitation UI)
        }
      } catch (err) {
        console.error("Error checking invitation:", err);
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsChecking(false);
      }
    };

    // Only check if not currently loading auth status
    if (!authLoading) {
      checkInvitation();
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const handleSignUp = () => {
    if (checkResult) {
      localStorage.setItem(
        "redirectAfterLogin",
        `${ROUTES.dividirCuenta}?highlight=${checkResult.billSplitId}`,
      );
      setLocation(ROUTES.registro);
    }
  };

  const handleSignIn = () => {
    if (checkResult) {
      localStorage.setItem(
        "redirectAfterLogin",
        `${ROUTES.dividirCuenta}?highlight=${checkResult.billSplitId}`,
      );
      setLocation(ROUTES.iniciarSesion);
    }
  };

  const handleViewAnyway = () => {
    if (checkResult) {
      setLocation(`${ROUTES.dividirCuenta}?highlight=${checkResult.billSplitId}`);
    }
  };

  if (authLoading || isChecking || isRedirecting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <h2 className="text-xl font-semibold mb-2">
              {isRedirecting ? "Account Found!" : "Processing Invitation"}
            </h2>
            <p className="text-gray-600">
              {isRedirecting
                ? "You have a CODA account. Redirecting you to sign in..."
                : "We're checking your invitation details..."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-red-600">
              <Mail className="w-8 h-8 mx-auto mb-2" />
              Invitation Error
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => setLocation("/")} variant="outline" className="w-full">
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!checkResult) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-blue-600" />
            Bill Split Invitation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bill Split Details */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">
              <DollarSign className="w-4 h-4 inline mr-1" />
              {checkResult.billSplitName}
            </h3>
            <p className="text-blue-700 text-sm">
              <Mail className="w-4 h-4 inline mr-1" />
              Invited: {checkResult.invitedEmail}
            </p>
          </div>

          {/* User Status and Actions */}
          {checkResult.userExists ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Account Found!</span>
              </div>
              <p className="text-center text-gray-600">
                We found your CODA account for {checkResult.invitedEmail}. Sign in to view and
                manage this bill split.
              </p>
              <Button onClick={handleSignIn} className="w-full" size="lg">
                <LogIn className="w-4 h-4 mr-2" />
                Sign In to View Bill Split
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2 text-blue-600">
                <UserPlus className="w-5 h-5" />
                <span className="font-medium">New to CODA?</span>
              </div>
              <p className="text-center text-gray-600">
                No account found for {checkResult.invitedEmail}. Create a free account to manage
                this bill split and track your expenses.
              </p>
              <div className="space-y-3">
                <Button onClick={handleSignUp} className="w-full" size="lg">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Create Account & View Bill Split
                </Button>
                <Button onClick={handleSignIn} variant="outline" className="w-full">
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In With Different Email
                </Button>
              </div>
            </div>
          )}

          {/* Alternative Action */}
          <div className="border-t pt-4">
            <p className="text-xs text-gray-500 text-center mb-2">
              Want to explore without signing in?
            </p>
            <Button
              onClick={handleViewAnyway}
              variant="ghost"
              size="sm"
              className="w-full text-gray-500"
            >
              View Demo Version
            </Button>
          </div>

          {/* Benefits Section */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">With a CODA account you can:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Split bills easily with friends</li>
              <li>• Track your expenses automatically</li>
              <li>• Set and achieve financial goals</li>
              <li>• Get personalized financial insights</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
