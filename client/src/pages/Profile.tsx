import { useState } from "react";
import { useAuth } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { getBankConnections } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
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
import { Loader2, Trash2, Lock, CreditCard, User } from "lucide-react";

export default function Profile() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  
  const { data: bankConnections, isLoading } = useQuery({
    queryKey: ["/api/bank-connections"],
  });

  // Profile form data
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleProfileUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    
    // In a real app, we would call an API to update the user profile
    setTimeout(() => {
      setIsUpdating(false);
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    }, 1000);
  };

  const handlePasswordUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.newPassword !== formData.confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "New password and confirmation password must match.",
        variant: "destructive",
      });
      return;
    }
    
    setIsUpdating(true);
    
    // In a real app, we would call an API to update the password
    setTimeout(() => {
      setIsUpdating(false);
      setFormData({
        ...formData,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast({
        title: "Password updated",
        description: "Your password has been updated successfully.",
      });
    }, 1000);
  };

  const handleDeleteAccount = () => {
    // In a real app, we would call an API to delete the user account
    setTimeout(() => {
      toast({
        title: "Account deleted",
        description: "Your account has been deleted. You will be logged out.",
      });
      logout();
    }, 1000);
  };

  const handleDisconnectBank = (connectionId: number) => {
    // In a real app, we would call an API to disconnect the bank
    toast({
      title: "Bank disconnected",
      description: "Your bank account has been disconnected.",
    });
  };

  // Get initials for avatar
  const getInitials = () => {
    if (!user) return "U";
    if (formData.firstName && formData.lastName) {
      return `${formData.firstName.charAt(0)}${formData.lastName.charAt(0)}`;
    }
    return user.username.charAt(0).toUpperCase();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 font-sans">Your Profile</h2>
      
      <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
        <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarFallback className="text-xl">{getInitials()}</AvatarFallback>
          </Avatar>
          
          <div>
            <h3 className="text-xl font-bold">
              {user?.firstName && user?.lastName 
                ? `${user.firstName} ${user.lastName}`
                : user?.username}
            </h3>
            <p className="text-gray-500">{user?.email}</p>
            <p className="text-sm text-gray-500 mt-1">
              Account created on {user?.createdAt 
                ? new Date(user.createdAt).toLocaleDateString() 
                : "N/A"}
            </p>
          </div>
        </div>
      </div>
      
      <Tabs defaultValue="profile" className="mb-6">
        <TabsList className="mb-4">
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="connections">
            <CreditCard className="h-4 w-4 mr-2" />
            Bank Connections
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information here. This information will be displayed in your profile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileUpdate}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      placeholder="First Name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      placeholder="Last Name"
                    />
                  </div>
                </div>
                
                <div className="mt-4 space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Email"
                  />
                </div>
                
                <div className="mt-6">
                  <Button type="submit" disabled={isUpdating}>
                    {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Update Profile
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Manage your password and account security.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordUpdate}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      name="currentPassword"
                      type="password"
                      value={formData.currentPassword}
                      onChange={handleInputChange}
                      placeholder="••••••••"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      value={formData.newPassword}
                      onChange={handleInputChange}
                      placeholder="••••••••"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                
                <div className="mt-6">
                  <Button type="submit" disabled={isUpdating}>
                    {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Update Password
                  </Button>
                </div>
              </form>
              
              <Separator className="my-6" />
              
              <div>
                <h3 className="text-lg font-medium text-red-600 mb-2">Danger Zone</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Once you delete your account, there is no going back. Please be certain.
                </p>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your account
                        and remove your data from our servers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteAccount}
                        className="bg-red-500 text-white hover:bg-red-600"
                      >
                        Delete Account
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="connections">
          <Card>
            <CardHeader>
              <CardTitle>Bank Connections</CardTitle>
              <CardDescription>
                Manage your connected financial accounts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : bankConnections && bankConnections.length > 0 ? (
                <div className="space-y-4">
                  {bankConnections.map((connection: any) => (
                    <div key={connection.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center">
                        <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center mr-4">
                          <CreditCard className="h-5 w-5 text-gray-600" />
                        </div>
                        <div>
                          <h4 className="font-medium">{connection.bankName}</h4>
                          <p className="text-sm text-gray-500">
                            {connection.accountType} &middot; Last updated {new Date(connection.lastUpdated).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            Disconnect
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Disconnect Bank?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to disconnect this bank account? 
                              You will need to reconnect it to continue using all features.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDisconnectBank(connection.id)}
                            >
                              Disconnect
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">
                    You haven't connected any bank accounts yet.
                  </p>
                  <Button
                    onClick={() => window.location.href = "/"}
                  >
                    Connect Bank Account
                  </Button>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-center border-t pt-6">
              <Button
                variant="outline"
                onClick={() => window.location.href = "/"}
              >
                Connect New Account
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
