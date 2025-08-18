import { useAuth0 } from "@auth0/auth0-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  User, 
  Lock, 
  Shield, 
  Settings, 
  Mail, 
  Calendar,
  Key,
  LogOut,
  Edit,
  Camera,
  Bell,
  Globe,
  CreditCard,
  Trash2,
  CheckCircle,
  AlertCircle
} from "lucide-react";

export default function Profile() {
  const { user, logout, isAuthenticated, isLoading } = useAuth0();
  const { toast } = useToast();
  const { updateProfile, getUserProfile } = useApi();
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    displayName: user?.name || "",
    email: user?.email || "",
    timezone: "UTC",
    language: "English"
  });

  // Load user profile data when component mounts
  useEffect(() => {
    if (isAuthenticated && user) {
      setProfileData({
        displayName: user.name || "",
        email: user.email || "",
        timezone: "UTC",
        language: "English"
      });
    }
  }, [isAuthenticated, user]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <div className="bg-white shadow rounded-lg p-8">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Authentication Required</h2>
          <p className="text-gray-600">You must be signed in to view your profile.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-20">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Get initials for avatar
  const getInitials = () => {
    if (!user) return "U";
    if (user.given_name && user.family_name) {
      return `${user.given_name.charAt(0)}${user.family_name.charAt(0)}`;
    }
    if (user.name) {
      return user.name.charAt(0).toUpperCase();
    }
    if (user.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "U";
  };

  const handleProfileUpdate = async () => {
    try {
      await updateProfile(profileData);
      setIsEditing(false);
      toast({
        title: "Profile updated",
        description: "Your profile information has been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  const handlePasswordChange = () => {
    // Redirect to Auth0's password change page
    window.open(`https://dev-klhap06xvhqbtvbi.us.auth0.com/authorize?client_id=re8BTok97oBa8oDHkobPRfTnZUSaAawr&response_type=code&redirect_uri=${encodeURIComponent(window.location.origin)}&scope=openid%20profile%20email&audience=&state=password_change`, '_blank');
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile Settings</h1>
        <p className="text-gray-600">Manage your account settings and preferences</p>
      </div>

      {/* Profile Overview Card */}
      <Card className="mb-8">
        <CardHeader className="pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Avatar className="h-20 w-20">
                {user?.picture ? (
                  <img src={user.picture} alt="Profile" className="rounded-full h-20 w-20 object-cover" />
                ) : (
                  <AvatarFallback className="text-xl bg-primary text-white">
                    {getInitials()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {user?.name || user?.email || "User"}
                </h2>
                <p className="text-gray-600 flex items-center">
                  <Mail className="h-4 w-4 mr-2" />
                  {user?.email}
                </p>
                <div className="flex items-center mt-2">
                  <Badge variant="secondary" className="mr-2">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified Account
                  </Badge>
                  <Badge variant="outline">
                    <Calendar className="h-3 w-3 mr-1" />
                    Member since {new Date().toLocaleDateString()}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                <Camera className="h-4 w-4 mr-2" />
                Change Photo
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Settings Tabs */}
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile" className="flex items-center">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center">
            <Shield className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center">
            <Settings className="h-4 w-4 mr-2" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="account" className="flex items-center">
            <CreditCard className="h-4 w-4 mr-2" />
            Account
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Personal Information
                </CardTitle>
                <CardDescription>
                  Update your personal details and contact information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={profileData.displayName}
                    onChange={(e) => setProfileData({...profileData, displayName: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    disabled
                    className="bg-gray-50"
                  />
                  <p className="text-sm text-gray-500">Email is managed by Auth0</p>
                </div>
                {isEditing && (
                  <Button onClick={handleProfileUpdate} className="w-full">
                    Save Changes
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Globe className="h-5 w-5 mr-2" />
                  Account Information
                </CardTitle>
                <CardDescription>
                  View your account details and status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Account ID</Label>
                  <div className="text-sm text-gray-600 font-mono bg-gray-50 p-2 rounded">
                    {user?.sub || "N/A"}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Badge variant="secondary">Premium</Badge>
                </div>
                <div className="space-y-2">
                  <Label>Last Login</Label>
                  <div className="text-sm text-gray-600">
                    {new Date().toLocaleString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Lock className="h-5 w-5 mr-2" />
                  Password & Security
                </CardTitle>
                <CardDescription>
                  Manage your password and security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span className="text-sm text-gray-600">••••••••</span>
                    <Button variant="outline" size="sm" onClick={handlePasswordChange}>
                      <Key className="h-4 w-4 mr-2" />
                      Change Password
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Two-Factor Authentication</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Not enabled</span>
                    <Button variant="outline" size="sm">
                      Enable 2FA
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Active Sessions</Label>
                  <div className="text-sm text-gray-600">
                    <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                      <span>Current Session</span>
                      <Badge variant="secondary">Active</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Security Settings
                </CardTitle>
                <CardDescription>
                  Configure additional security options
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Login Notifications</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Email notifications for new logins</span>
                    <Button variant="outline" size="sm">
                      Configure
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Account Recovery</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Recovery email and phone</span>
                    <Button variant="outline" size="sm">
                      Set Up
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Application Preferences
                </CardTitle>
                <CardDescription>
                  Customize your app experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <select 
                    id="language" 
                    className="w-full p-2 border rounded"
                    value={profileData.language}
                    onChange={(e) => setProfileData({...profileData, language: e.target.value})}
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <select 
                    id="timezone" 
                    className="w-full p-2 border rounded"
                    value={profileData.timezone}
                    onChange={(e) => setProfileData({...profileData, timezone: e.target.value})}
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Notifications</Label>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Email Notifications</span>
                      <Button variant="outline" size="sm">
                        <Bell className="h-4 w-4 mr-2" />
                        Configure
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Push Notifications</span>
                      <Button variant="outline" size="sm">
                        <Bell className="h-4 w-4 mr-2" />
                        Configure
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="h-5 w-5 mr-2" />
                  Financial Preferences
                </CardTitle>
                <CardDescription>
                  Manage your financial data preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Data Sharing</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Share financial data for analysis</span>
                    <Button variant="outline" size="sm">
                      Configure
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Privacy Settings</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Manage data privacy</span>
                    <Button variant="outline" size="sm">
                      View Settings
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="h-5 w-5 mr-2" />
                  Account Management
                </CardTitle>
                <CardDescription>
                  Manage your account and subscription
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Subscription Plan</Label>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded">
                    <div>
                      <span className="font-medium">Premium Plan</span>
                      <p className="text-sm text-gray-600">Full access to all features</p>
                    </div>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Billing</Label>
                  <Button variant="outline" size="sm" className="w-full">
                    Manage Billing
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Export Data</Label>
                  <Button variant="outline" size="sm" className="w-full">
                    Export My Data
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <LogOut className="h-5 w-5 mr-2" />
                  Account Actions
                </CardTitle>
                <CardDescription>
                  Sign out or manage your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
                
                <Separator />
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Account</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your account
                        and remove all your data from our servers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-red-500 hover:bg-red-600">
                        Delete Account
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
