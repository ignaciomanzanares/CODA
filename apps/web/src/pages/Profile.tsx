import { useAuth } from "@/lib/auth";
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
  const { user, logout, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const { updateProfile, deleteAccount, changePassword, getUserProfile } = useApi();
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    displayName: "",
    email: "",
    timezone: "UTC",
    language: "English"
  });

  // Load user profile data from database API when component mounts
  useEffect(() => {
    const loadProfile = async () => {
      if (isAuthenticated) {
        try {
          const profile = await getUserProfile();
          setProfileData({
            displayName: profile.displayName || "",
            email: profile.email || "",
            timezone: profile.timezone || "UTC",
            language: profile.language || "English"
          });
        } catch (error) {
          console.error('Failed to load profile, falling back to Auth0 data:', error);
          // Fallback to Auth0 data if API fails
          setProfileData({
            displayName: user?.name || "",
            email: user?.email || "",
            timezone: "UTC",
            language: "English"
          });
        }
      }
    };

    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  if (!isAuthenticated) {
    return (
      <div className="container py-8 text-center">
        <div className="bg-white shadow rounded-lg p-8 max-w-lg mx-auto">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Autenticación requerida</h2>
          <p className="text-gray-600">Debes iniciar sesión para ver tu perfil.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Get initials for avatar
  const getInitials = () => {
    if (!user) return "U";
    if (user.name) {
      const parts = user.name.split(" ");
      if (parts.length >= 2) {
        return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
      }
      return user.name.charAt(0).toUpperCase();
    }
    if (user.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "U";
  };

  const handleProfileUpdate = async () => {
    try {
      const updatedProfile = await updateProfile(profileData);
      
      // Update local state with the response from backend
      if (updatedProfile) {
        setProfileData({
          displayName: updatedProfile.displayName || "",
          email: updatedProfile.email || "",
          timezone: updatedProfile.timezone || "UTC",
          language: updatedProfile.language || "English"
        });
      }
      
      setIsEditing(false);
      toast({
        title: "Perfil actualizado",
        description: "Tu perfil se ha actualizado correctamente.",
      });
    } catch (error) {
      console.error('Profile update error:', error);
      toast({
        title: "Error al actualizar",
        description: "No se pudo actualizar el perfil. Intenta de nuevo.",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    logout();
  };

  const handlePasswordChange = async () => {
    try {
      await changePassword();
      toast({
        title: "Correo enviado",
        description: "Revisa tu correo para las instrucciones para cambiar tu contraseña.",
      });
    } catch (error) {
      console.error('Password change error:', error);
      toast({
        title: "Error",
        description: "No se pudo enviar el correo. Intenta de nuevo.",
        variant: "destructive",
      });
    }
  };
  
  const handleDeleteAccount = async () => {
    try {
      // Call the backend API to delete the account
      const result = await deleteAccount();

      const localOnly = !!(result && result.localOnly);
      const description = localOnly
        ? "Your local CODA data was removed. Authentication deletion requires admin setup. You'll be logged out."
        : "Your account has been permanently deleted. You will now be logged out.";
      
      toast({
        title: "Cuenta eliminada",
        description,
        variant: "destructive",
      });
      
      // Logout the user after successful deletion
      setTimeout(() => {
        handleLogout();
      }, localOnly ? 1500 : 2000);
    } catch (error) {
      console.error('Delete account error:', error);
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again or contact support.",
        variant: "destructive",
      });
    }
  };
  
  const handleEnable2FA = () => {
    // Redirect to Auth0 MFA enrollment
    const domain = import.meta.env.VITE_AUTH0_DOMAIN || "dev-klhap06xvhqbtvbi.us.auth0.com";
    window.open(`https://${domain}/mfa`, '_blank');
  };

  const handleComingSoon = () => {
    toast({
      title: "Próximamente",
      description: "Esta función estará disponible en una futura actualización.",
    });
  };

  return (
    <div className="container py-8 space-y-8">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Configuración del perfil</h1>
        <p className="text-gray-600">Gestiona tu cuenta y preferencias</p>
      </div>

      {/* Profile Overview Card */}
      <Card className="mb-8">
        <CardHeader className="pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="text-xl bg-primary text-white">
                  {getInitials()}
                </AvatarFallback>
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
                    Cuenta verificada
                  </Badge>
                  <Badge variant="outline">
                    <Calendar className="h-3 w-3 mr-1" />
                    Miembro desde {new Date().toLocaleDateString()}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={handleComingSoon}>
                <Camera className="h-4 w-4 mr-2" />
                Cambiar foto
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar perfil
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
            Perfil
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center">
            <Shield className="h-4 w-4 mr-2" />
            Seguridad
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center">
            <Settings className="h-4 w-4 mr-2" />
            Preferencias
          </TabsTrigger>
          <TabsTrigger value="account" className="flex items-center">
            <CreditCard className="h-4 w-4 mr-2" />
            Cuenta
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Información personal
                </CardTitle>
                <CardDescription>
                  Actualiza tus datos y datos de contacto
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Nombre para mostrar</Label>
                  <Input
                    id="displayName"
                    value={profileData.displayName}
                    onChange={(e) => setProfileData({...profileData, displayName: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    disabled
                    className="bg-gray-50"
                  />
                  <p className="text-sm text-gray-500">El correo se gestiona con Auth0</p>
                </div>
                {isEditing && (
                  <Button onClick={handleProfileUpdate} className="w-full">
                    Guardar cambios
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
                  Ver detalles y estado de tu cuenta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Account ID</Label>
                  <div className="text-sm text-gray-600 font-mono bg-gray-50 p-2 rounded break-all">
                    {user?.userId || "N/A"}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Login Provider</Label>
                  <div className="text-sm text-gray-600">
                    📧 Correo y contraseña
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
                  Contraseña y seguridad
                </CardTitle>
                <CardDescription>
                  Gestiona tu contraseña y opciones de seguridad
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Contraseña</Label>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span className="text-sm text-gray-600">••••••••</span>
                    <Button variant="outline" size="sm" onClick={handlePasswordChange}>
                      <Key className="h-4 w-4 mr-2" />
                      Cambiar contraseña
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Autenticación en dos pasos</Label>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-600">No activada</span>
                      <p className="text-xs text-gray-500">Añade seguridad extra a tu cuenta</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleEnable2FA}>
                      <Shield className="h-4 w-4 mr-2" />
                      Activar 2FA
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Sesiones activas</Label>
                  <div className="text-sm text-gray-600">
                    <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                      <span>Sesión actual</span>
                      <Badge variant="secondary">Activa</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Configuración de seguridad
                </CardTitle>
                <CardDescription>
                  Configura opciones de seguridad adicionales
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Notificaciones de inicio de sesión</Label>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-600">Notificaciones por correo al iniciar sesión</span>
                      <p className="text-xs text-gray-500">Recibe avisos ante actividad sospechosa</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleComingSoon}>
                      <Bell className="h-4 w-4 mr-2" />
                      Configurar
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Recuperación de cuenta</Label>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-600">Correo de recuperación: {user?.email}</span>
                      <p className="text-xs text-gray-500">Gestionado por Auth0</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleComingSoon}>
                      <Key className="h-4 w-4 mr-2" />
                      Actualizar
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
                  Preferencias de la aplicación
                </CardTitle>
                <CardDescription>
                  Personaliza tu experiencia en la app
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Idioma</Label>
                  <select 
                    id="language" 
                    className="w-full p-2 border rounded"
                    value={profileData.language}
                    onChange={(e) => setProfileData({...profileData, language: e.target.value})}
                  >
                    <option value="English">Inglés</option>
                    <option value="Spanish">Español</option>
                    <option value="French">Francés</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Zona horaria</Label>
                  <select 
                    id="timezone" 
                    className="w-full p-2 border rounded"
                    value={profileData.timezone}
                    onChange={(e) => setProfileData({...profileData, timezone: e.target.value})}
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Hora del Este</option>
                    <option value="America/Chicago">Hora Central</option>
                    <option value="America/Denver">Hora de las Montañas</option>
                    <option value="America/Los_Angeles">Hora del Pacífico</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Notificaciones</Label>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Notificaciones por correo</span>
                      <Button variant="outline" size="sm" onClick={handleComingSoon}>
                        <Bell className="h-4 w-4 mr-2" />
                        Configurar
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Notificaciones push</span>
                      <Button variant="outline" size="sm" onClick={handleComingSoon}>
                        <Bell className="h-4 w-4 mr-2" />
                        Configurar
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
                    <Button variant="outline" size="sm" onClick={handleComingSoon}>
                      Configurar
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Privacidad</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Manage data privacy</span>
                    <Button variant="outline" size="sm" onClick={handleComingSoon}>
                      Ver configuración
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
                  <Button variant="outline" size="sm" className="w-full" onClick={handleComingSoon}>
                    Manage Billing
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Export Data</Label>
                  <Button variant="outline" size="sm" className="w-full" onClick={handleComingSoon}>
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
                      Eliminar cuenta
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminar cuenta</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción no se puede deshacer. Se eliminará tu cuenta de forma permanente
                        y todos tus datos de nuestros servidores.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction 
                        className="bg-red-500 hover:bg-red-600"
                        onClick={handleDeleteAccount}
                      >
                        Eliminar cuenta
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
