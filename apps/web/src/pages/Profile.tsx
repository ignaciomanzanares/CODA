import { useAuth } from "@/lib/auth";
import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useApi } from "@/lib/api";
import type { PrivacyConsentPanelResponse, PrivacyPurposeKey } from "@/types";
import { REGISTRATION_REQUIRED_PRIVACY_PURPOSES } from "@/types";
import {
  isPushSupported,
  getPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isCurrentlySubscribed,
  sendTestPush,
} from "@/lib/pushNotifications";
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
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

const PRIVACY_LABELS: Record<
  PrivacyPurposeKey,
  { title: string; description: string }
> = {
  data_processing: {
    title: "Tratamiento de datos personales",
    description: "Uso de tus datos de cuenta y perfil para operar el servicio.",
  },
  open_banking: {
    title: "Acceso a datos bancarios (Open Finance)",
    description: "Lectura de cuentas y movimientos al conectar tu banco (SFA).",
  },
  scoring: {
    title: "Score crediticio y transaccional",
    description: "Cálculo de indicadores de riesgo y comportamiento financiero.",
  },
  recommendations: {
    title: "Recomendaciones de productos",
    description: "Ofertas de productos financieros acordes a tu perfil.",
  },
  marketing: {
    title: "Comunicaciones comerciales",
    description: "Novedades y promociones por canales electrónicos.",
  },
  origination_transfer: {
    title: "Evaluación con institución financiera",
    description: "Compartir datos con el proveedor al solicitar un producto.",
  },
};

export default function Profile() {
  const { user, logout, isAuthenticated, isLoading, token } = useAuth();
  const { toast } = useToast();
  const {
    updateProfile,
    deleteAccount,
    changePassword,
    getUserProfile,
    getPrivacyConsents,
    acceptPrivacyPurpose,
    revokePrivacyPurpose,
    getMFAStatus,
    enableTwoFactor,
    disableTwoFactor,
  } = useApi();
  const [privacyPanel, setPrivacyPanel] = useState<PrivacyConsentPanelResponse | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacyConsentError, setPrivacyConsentError] = useState<string | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState<PrivacyPurposeKey | null>(null);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    displayName: "",
    email: "",
    timezone: "America/Santiago",
    language: "Spanish"
  });

  // Push notification state
  const [pushSupported] = useState(() => isPushSupported());
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    if (pushSupported) {
      isCurrentlySubscribed().then(setPushSubscribed);
    }
  }, [pushSupported]);

  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      const authToken = token || localStorage.getItem("jwt_token") || "";
      if (pushSubscribed) {
        const ok = await unsubscribeFromPush(authToken);
        if (ok) {
          setPushSubscribed(false);
          toast({ title: "Notificaciones push desactivadas" });
        }
      } else {
        const ok = await subscribeToPush(authToken);
        if (ok) {
          setPushSubscribed(true);
          toast({ title: "Notificaciones push activadas", description: "Recibirás alertas incluso con la app cerrada." });
        } else {
          const perm = getPushPermission();
          if (perm === "denied") {
            toast({ title: "Permiso denegado", description: "Habilita las notificaciones desde la configuración de tu navegador.", variant: "destructive" });
          } else {
            toast({ title: "No se pudo activar", description: "Intenta nuevamente.", variant: "destructive" });
          }
        }
      }
    } finally {
      setPushLoading(false);
    }
  };

  const handleTestPush = async () => {
    const authToken = token || localStorage.getItem("jwt_token") || "";
    const ok = await sendTestPush(authToken);
    if (ok) {
      toast({ title: "Push de prueba enviado", description: "Deberías recibir una notificación en breve." });
    } else {
      toast({ title: "Error al enviar", variant: "destructive" });
    }
  };

  // Load user profile data from database API when component mounts
  useEffect(() => {
    const loadProfile = async () => {
      if (isAuthenticated) {
        try {
          const profile = await getUserProfile();
          setProfileData({
            displayName: profile.displayName || "",
            email: profile.email || "",
            timezone: profile.timezone || "America/Santiago",
            language: profile.language || "Spanish"
          });
        } catch (error) {
          console.error('Failed to load profile, falling back to datos de sesión:', error);
          // Fallback a datos de sesión si la API falla
          setProfileData({
            displayName: user?.name || "",
            email: user?.email || "",
            timezone: "America/Santiago",
            language: "Spanish"
          });
        }
      }
    };

    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  const loadPrivacyConsents = useCallback(async () => {
    if (!isAuthenticated) return;
    setPrivacyConsentError(null);
    setPrivacyLoading(true);
    try {
      const p = await getPrivacyConsents();
      setPrivacyPanel(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudieron cargar los consentimientos";
      setPrivacyConsentError(msg);
    } finally {
      setPrivacyLoading(false);
    }
  }, [isAuthenticated, getPrivacyConsents]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadPrivacyConsents();
  }, [isAuthenticated, loadPrivacyConsents]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getMFAStatus()
      .then((s) => {
        if (!cancelled) setMfaEnrolled(!!s.enrolled);
      })
      .catch(() => {
        if (!cancelled) setMfaEnrolled(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handlePrivacyToggle = useCallback(
    async (purpose: PrivacyPurposeKey, checked: boolean) => {
      setPrivacyBusy(purpose);
      try {
        const r = checked ? await acceptPrivacyPurpose(purpose) : await revokePrivacyPurpose(purpose);
        setPrivacyPanel(r);
        toast({
          title: checked ? "Consentimiento registrado" : "Revocación registrada",
          description: "Queda registrado en el historial con versión de política e IP.",
        });
      } catch (e) {
        toast({
          title: "Error",
          description: e instanceof Error ? e.message : "No se pudo actualizar el consentimiento",
          variant: "destructive",
        });
      } finally {
        setPrivacyBusy(null);
      }
    },
    [acceptPrivacyPurpose, revokePrivacyPurpose, toast]
  );

  if (!isAuthenticated) {
    return (
      <div className="container py-8 text-center">
        <div className="bg-card shadow rounded-lg p-8 max-w-lg mx-auto">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-4">Autenticación requerida</h2>
          <p className="text-muted-foreground">Debes iniciar sesión para ver tu perfil.</p>
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
          timezone: updatedProfile.timezone || "America/Santiago",
          language: updatedProfile.language || "Spanish"
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
    logout("personal");
  };

  const handlePasswordChange = async () => {
    try {
      const result = await changePassword();
      const msg =
        result && typeof result === "object" && "message" in result && typeof (result as { message?: string }).message === "string"
          ? (result as { message: string }).message
          : undefined;
      toast({
        title: "Cambiar contraseña",
        description: msg ?? "Cierra sesión y en el inicio usa «Olvidé mi contraseña».",
      });
    } catch (error) {
      console.error('Password change error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo completar la solicitud.",
        variant: "destructive",
      });
    }
  };

  const handleSavePreferences = async () => {
    try {
      const updated = await updateProfile({
        displayName: profileData.displayName,
        timezone: profileData.timezone,
        language: profileData.language,
      });
      if (updated && typeof updated === "object") {
        const u = updated as Record<string, unknown>;
        setProfileData((prev) => ({
          ...prev,
          displayName: typeof u.displayName === "string" ? u.displayName : prev.displayName,
          timezone: typeof u.timezone === "string" ? u.timezone : prev.timezone,
          language: typeof u.language === "string" ? u.language : prev.language,
          email: typeof u.email === "string" ? u.email : prev.email,
        }));
      }
      toast({
        title: "Preferencias guardadas",
        description: "Idioma y zona horaria actualizados.",
      });
    } catch (error) {
      console.error("Save preferences error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudieron guardar las preferencias.",
        variant: "destructive",
      });
    }
  };

  const handleEnable2FA = async () => {
    setMfaBusy(true);
    try {
      const r = await enableTwoFactor();
      toast({
        title: "2FA activado",
        description: r?.message ?? "La autenticación en dos pasos quedó habilitada en tu cuenta CODA.",
      });
      const s = await getMFAStatus();
      setMfaEnrolled(!!s.enrolled);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo activar 2FA.",
        variant: "destructive",
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisable2FA = async () => {
    setMfaBusy(true);
    try {
      const r = await disableTwoFactor();
      toast({
        title: "2FA desactivado",
        description: r?.message ?? "Ya no se pedirá segundo factor al iniciar sesión.",
      });
      setMfaEnrolled(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo desactivar 2FA.",
        variant: "destructive",
      });
    } finally {
      setMfaBusy(false);
    }
  };
  
  const handleDeleteAccount = async () => {
    try {
      // Call the backend API to delete the account
      const result = await deleteAccount();

      const localOnly = !!(result && result.localOnly);
      const description = localOnly
        ? "Se eliminaron tus datos locales de CODA. La eliminación de la autenticación requiere configuración del administrador. Se cerrará tu sesión."
        : "Tu cuenta ha sido eliminada de forma permanente. Se cerrará tu sesión.";
      
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
        description: "No se pudo eliminar la cuenta. Intenta de nuevo o contacta a soporte.",
        variant: "destructive",
      });
    }
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
        <h1 className="text-3xl font-bold text-foreground mb-2">Configuración del perfil</h1>
        <p className="text-muted-foreground">Gestiona tu cuenta y preferencias</p>
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
                <h2 className="text-2xl font-bold text-foreground">
                  {user?.name || user?.email || "Usuario"}
                </h2>
                <p className="text-muted-foreground flex items-center">
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
                    className="bg-muted/50"
                  />
                  <p className="text-sm text-muted-foreground">El correo no se puede cambiar aquí por seguridad. Contacta soporte si necesitas actualizarlo.</p>
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
                  Información de la cuenta
                </CardTitle>
                <CardDescription>
                  Detalles y estado de tu cuenta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>ID de cuenta</Label>
                  <div className="text-sm text-muted-foreground font-mono bg-muted/50 p-2 rounded break-all">
                    {user?.userId || "N/A"}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Método de acceso</Label>
                  <div className="text-sm text-muted-foreground">
                    📧 Correo y contraseña
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de cuenta</Label>
                  <Badge variant="secondary">Gratuita</Badge>
                </div>
                <div className="space-y-2">
                  <Label>Último acceso</Label>
                  <div className="text-sm text-muted-foreground">
                    {new Date().toLocaleString("es-CL")}
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
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
                    <span className="text-sm text-muted-foreground">••••••••</span>
                    <Button variant="outline" size="sm" onClick={handlePasswordChange}>
                      <Key className="h-4 w-4 mr-2" />
                      Cambiar contraseña
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Autenticación en dos pasos</Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="text-sm text-muted-foreground">
                        {mfaEnrolled ? "Activada" : "No activada"}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {mfaEnrolled
                          ? "Tu cuenta pide un segundo factor al iniciar sesión."
                          : "Añade seguridad extra a tu cuenta (CODA)."}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!mfaEnrolled ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleEnable2FA()}
                          disabled={mfaBusy}
                        >
                          <Shield className="h-4 w-4 mr-2" />
                          {mfaBusy ? "…" : "Activar 2FA"}
                        </Button>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={mfaBusy}>
                              Desactivar 2FA
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Desactivar 2FA?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tu cuenta será menos protegida. Solo hazlo si reconoces este dispositivo.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void handleDisable2FA()}>
                                Desactivar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Sesiones activas</Label>
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-500/10 rounded">
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
                      <span className="text-sm text-muted-foreground">Notificaciones por correo al iniciar sesión</span>
                      <p className="text-xs text-muted-foreground">Recibe avisos ante actividad sospechosa</p>
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
                      <span className="text-sm text-muted-foreground">Correo de recuperación: {user?.email}</span>
                      <p className="text-xs text-muted-foreground">Recuperación vía «Olvidé mi contraseña» en el inicio de sesión</p>
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
                    <option value="America/Santiago">Chile (Santiago)</option>
                  </select>
                </div>
                <Button type="button" className="w-full sm:w-auto" onClick={() => void handleSavePreferences()}>
                  Guardar preferencias
                </Button>
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
                      <div>
                        <span className="text-sm">Notificaciones push</span>
                        {!pushSupported && (
                          <p className="text-xs text-muted-foreground">No soportado en este navegador</p>
                        )}
                        {pushSupported && getPushPermission() === "denied" && (
                          <p className="text-xs text-red-400">Permiso denegado en el navegador</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant={pushSubscribed ? "default" : "outline"}
                          size="sm"
                          onClick={handleTogglePush}
                          disabled={!pushSupported || pushLoading}
                        >
                          <Bell className="h-4 w-4 mr-2" />
                          {pushLoading ? "..." : pushSubscribed ? "Activadas" : "Activar"}
                        </Button>
                        {pushSubscribed && (
                          <Button variant="ghost" size="sm" onClick={handleTestPush}>
                            Probar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Consentimientos y privacidad
                </CardTitle>
                <CardDescription>
                  Finalidades (Ley 19.628 / CMF). Versión de política:{" "}
                  {privacyPanel?.policyVersion ?? "—"}. Los cambios quedan auditados en servidor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Conexiones bancarias (SFA)</p>
                    <p className="text-xs text-muted-foreground">Consentimientos OAuth con el banco</p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/conexiones">Abrir panel</Link>
                  </Button>
                </div>
                {privacyConsentError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
                    <p className="text-destructive font-medium">No se pudieron cargar los consentimientos</p>
                    <p className="text-muted-foreground text-xs">{privacyConsentError}</p>
                    <Button variant="outline" size="sm" type="button" onClick={() => void loadPrivacyConsents()}>
                      Reintentar
                    </Button>
                  </div>
                )}
                {privacyLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando consentimientos…
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(privacyPanel?.purposes ?? []).map((row) => {
                      const meta = PRIVACY_LABELS[row.purpose];
                      const busy = privacyBusy === row.purpose;
                      return (
                        <div
                          key={row.purpose}
                          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3 last:border-0 last:pb-0"
                        >
                          <div className="flex-1 pr-2">
                            <p className="text-sm font-medium">{meta?.title ?? row.purpose}</p>
                            <p className="text-xs text-muted-foreground">{meta?.description}</p>
                            {row.updatedAt && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                Último evento:{" "}
                                {new Date(row.updatedAt).toLocaleString("es-CL", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}{" "}
                                · v{row.policyVersion ?? "—"}
                              </p>
                            )}
                            {REGISTRATION_REQUIRED_PRIVACY_PURPOSES.includes(row.purpose) &&
                              row.accepted && (
                                <p className="text-[10px] text-amber-700 dark:text-amber-500 mt-1">
                                  Obligatorio para el servicio. Para revocar, cierra la cuenta o contacta soporte.
                                </p>
                              )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                            <Switch
                              checked={row.accepted}
                              disabled={
                                busy ||
                                (REGISTRATION_REQUIRED_PRIVACY_PURPOSES.includes(row.purpose) &&
                                  row.accepted)
                              }
                              onCheckedChange={(c) => handlePrivacyToggle(row.purpose, c === true)}
                              aria-label={meta?.title ?? row.purpose}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Los cambios de consentimiento quedan registrados en servidor con versión de política, canal e IP.
                </p>
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
                  Tu plan
                </CardTitle>
                <CardDescription>
                  Información sobre tu cuenta y datos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Plan actual</Label>
                  <div className="flex items-center justify-between p-3 bg-primary/5 dark:bg-primary/10 rounded">
                    <div>
                      <span className="font-medium">Plan Gratuito</span>
                      <p className="text-sm text-muted-foreground">Acceso completo a todas las funciones</p>
                    </div>
                    <Badge variant="secondary">Activo</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Exportar datos</Label>
                  <Button variant="outline" size="sm" className="w-full" onClick={handleComingSoon}>
                    Descargar mis datos
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Descarga una copia de tus datos personales (derecho de portabilidad, Ley 19.628).
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <LogOut className="h-5 w-5 mr-2" />
                  Acciones de cuenta
                </CardTitle>
                <CardDescription>
                  Cerrar sesión o eliminar tu cuenta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Cerrar sesión
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
