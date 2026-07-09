import { useAuth } from "@/lib/auth";
import { useState, useEffect, useCallback, useRef } from "react";
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
import { PastelIcon } from "@/components/ui/pastel-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Key,
  LogOut,
  Bell,
  Globe,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Download,
  Smartphone,
  Save,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useCurrency } from "@/lib/CurrencyContext";
import type { CurrencyCode } from "@/lib/utils";
import i18n from "@/i18n";

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

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

type SectionId = "profile" | "security" | "preferences" | "privacy" | "account";

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Perfil", icon: User },
  { id: "security", label: "Seguridad", icon: Shield },
  { id: "preferences", label: "Preferencias", icon: Settings },
  { id: "privacy", label: "Privacidad", icon: Lock },
  { id: "account", label: "Cuenta", icon: Globe },
];

// ──────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────

export default function Profile() {
  const { user, logout, isAuthenticated, isLoading } = useAuth();
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

  const { currency, setCurrency } = useCurrency();
  const [activeSection, setActiveSection] = useState<SectionId>("profile");
  const [privacyPanel, setPrivacyPanel] = useState<PrivacyConsentPanelResponse | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacyConsentError, setPrivacyConsentError] = useState<string | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState<PrivacyPurposeKey | null>(null);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [profileData, setProfileData] = useState({
    displayName: "",
    email: "",
    timezone: "America/Santiago",
    language: "Spanish",
    createdAt: null as string | null,
  });

  // Push notification state
  const [pushSupported] = useState(() => isPushSupported());
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);

  useEffect(() => {
    if (pushSupported) {
      isCurrentlySubscribed().then(setPushSubscribed);
    }
  }, [pushSupported]);

  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        const ok = await unsubscribeFromPush();
        if (ok) {
          setPushSubscribed(false);
          toast({ title: "Notificaciones push desactivadas" });
        }
      } else {
        const ok = await subscribeToPush();
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
    setPushTesting(true);
    try {
      const result = await sendTestPush();
      if (result.ok && result.devicesSent > 0) {
        toast({ title: "Push de prueba enviado", description: "Deberías recibir una notificación en breve." });
      } else if (result.ok) {
        setPushSubscribed(false);
        toast({
          title: "No hay dispositivos suscritos",
          description: "Activa las notificaciones nuevamente en este navegador.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Error al enviar", variant: "destructive" });
      }
    } finally {
      setPushTesting(false);
    }
  };

  // Load profile
  useEffect(() => {
    const loadProfile = async () => {
      if (!isAuthenticated) return;
      try {
        const profile = await getUserProfile();
        const lang = profile.language || "Spanish";
        setProfileData({
          displayName: profile.displayName || "",
          email: profile.email || "",
          timezone: profile.timezone || "America/Santiago",
          language: lang,
          createdAt: (profile as Record<string, unknown>).createdAt as string | null ?? null,
        });
        void i18n.changeLanguage(lang === "English" ? "en" : "es");
      } catch {
        setProfileData({
          displayName: user?.name || "",
          email: user?.email || "",
          timezone: "America/Santiago",
          language: "Spanish",
          createdAt: null,
        });
      }
    };
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  // Load privacy consents — only when the privacy tab is active
  const privacyLoadedRef = useRef(false);

  const loadPrivacyConsents = useCallback(async () => {
    if (!isAuthenticated) return;
    setPrivacyConsentError(null);
    setPrivacyLoading(true);
    try {
      const p = await getPrivacyConsents();
      setPrivacyPanel(p);
      privacyLoadedRef.current = true;
    } catch (e) {
      setPrivacyConsentError(e instanceof Error ? e.message : "No se pudieron cargar los consentimientos");
    } finally {
      setPrivacyLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && activeSection === "privacy" && !privacyLoadedRef.current) {
      void loadPrivacyConsents();
    }
  }, [isAuthenticated, activeSection, loadPrivacyConsents]);

  // Load MFA
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getMFAStatus()
      .then((s) => { if (!cancelled) setMfaEnrolled(!!s.enrolled); })
      .catch(() => { if (!cancelled) setMfaEnrolled(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Handlers

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

  const handleProfileUpdate = async () => {
    setSavingProfile(true);
    try {
      const updated = await updateProfile(profileData);
      if (updated) {
        setProfileData((prev) => ({
          ...prev,
          displayName: updated.displayName || prev.displayName,
          email: updated.email || prev.email,
          timezone: updated.timezone || prev.timezone,
          language: updated.language || prev.language,
        }));
      }
      setIsEditing(false);
      toast({ title: "Perfil actualizado", description: "Tus datos se guardaron correctamente." });
    } catch {
      toast({ title: "Error al actualizar", description: "No se pudo guardar. Intenta de nuevo.", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
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
      void i18n.changeLanguage(profileData.language === "English" ? "en" : "es");
      toast({ title: "Preferencias guardadas" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudieron guardar las preferencias.",
        variant: "destructive",
      });
    } finally {
      setSavingPrefs(false);
    }
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
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo completar la solicitud.",
        variant: "destructive",
      });
    }
  };

  const handleEnable2FA = async () => {
    setMfaBusy(true);
    try {
      const r = await enableTwoFactor();
      toast({ title: "2FA activado", description: r?.message ?? "La autenticación en dos pasos quedó habilitada." });
      const s = await getMFAStatus();
      setMfaEnrolled(!!s.enrolled);
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "No se pudo activar 2FA.", variant: "destructive" });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisable2FA = async () => {
    setMfaBusy(true);
    try {
      const r = await disableTwoFactor();
      toast({ title: "2FA desactivado", description: r?.message ?? "Ya no se pedirá segundo factor al iniciar sesión." });
      setMfaEnrolled(false);
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "No se pudo desactivar 2FA.", variant: "destructive" });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const result = await deleteAccount();
      const localOnly = !!(result && result.localOnly);
      toast({
        title: "Cuenta eliminada",
        description: localOnly
          ? "Se eliminaron tus datos locales. Se cerrará tu sesión."
          : "Tu cuenta ha sido eliminada. Se cerrará tu sesión.",
        variant: "destructive",
      });
      setTimeout(() => logout("personal"), localOnly ? 1500 : 2000);
    } catch {
      toast({ title: "Error", description: "No se pudo eliminar la cuenta. Intenta de nuevo.", variant: "destructive" });
    }
  };

  // ── Guards ──

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <AlertCircle className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Autenticación requerida</h2>
          <p className="text-sm text-muted-foreground">Debes iniciar sesión para ver tu perfil.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  // ── Helpers ──

  const getInitials = () => {
    if (!user) return "U";
    if (user.name) {
      const parts = user.name.split(" ");
      return parts.length >= 2
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : user.name[0].toUpperCase();
    }
    return user.email?.[0]?.toUpperCase() ?? "U";
  };

  const memberSince = profileData.createdAt
    ? new Date(profileData.createdAt).toLocaleDateString("es-CL", { month: "long", year: "numeric" })
    : null;

  // ── Render ──

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">

        {/* ── Header ── */}
        <div className="flex items-start gap-4">
          <PastelIcon icon={User} color="indigo" size="md" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Configuración
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gestiona tu cuenta, seguridad y preferencias
            </p>
          </div>
        </div>

        {/* ── Profile Hero ── */}
        <Card className="overflow-hidden rounded-2xl border-border">
          <div className="h-28 bg-gradient-to-r from-blue-600 to-indigo-600" />
          <CardContent className="relative px-5 pb-5 pt-0">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12">
              <Avatar className="h-20 w-20 border-4 border-background shadow-lg">
                <AvatarFallback className="text-xl bg-primary text-white font-bold">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 sm:pb-1">
                <h2 className="text-xl font-bold text-foreground truncate">
                  {profileData.displayName || user?.name || user?.email || "Usuario"}
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    {user?.email}
                  </span>
                  {memberSince && (
                    <span className="text-xs text-muted-foreground">
                      Miembro desde {memberSince}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Badge
                  variant="secondary"
                  className="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border-0"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Verificada
                </Badge>
                <Badge variant="outline">Gratuita</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Body: sidebar nav + content ── */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Sidebar nav */}
          <nav className="lg:w-56 shrink-0 relative">
            <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 scrollbar-none scroll-smooth">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors shrink-0 ${
                    activeSection === id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            {/* Right fade on mobile */}
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent pointer-events-none lg:hidden" />
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* ────── PROFILE ────── */}
            {activeSection === "profile" && (
              <Card className="rounded-2xl">
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Información personal</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Tu nombre y datos de contacto</p>
                    </div>
                    <Button
                      variant={isEditing ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIsEditing(!isEditing)}
                    >
                      {isEditing ? "Cancelar" : "Editar"}
                    </Button>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Nombre</Label>
                      <Input
                        id="displayName"
                        value={profileData.displayName}
                        onChange={(e) => setProfileData({ ...profileData, displayName: e.target.value })}
                        disabled={!isEditing}
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Correo electrónico</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profileData.email}
                        disabled
                        className="rounded-xl bg-muted/50"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Para cambiar tu correo, contacta a soporte.
                      </p>
                    </div>
                  </div>

                  {isEditing && (
                    <Button onClick={handleProfileUpdate} disabled={savingProfile} className="gap-2">
                      {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Guardar cambios
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ────── SECURITY ────── */}
            {activeSection === "security" && (
              <div className="space-y-6">
                {/* Password */}
                <Card className="rounded-2xl">
                  <CardContent className="p-6 space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Contraseña</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Gestiona tu contraseña de acceso</p>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                          <Key className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">••••••••</p>
                          <p className="text-xs text-muted-foreground">Última actualización desconocida</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={handlePasswordChange}>
                        Cambiar
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* 2FA */}
                <Card className="rounded-2xl">
                  <CardContent className="p-6 space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Autenticación en dos pasos</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Añade una capa extra de seguridad a tu cuenta</p>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          mfaEnrolled
                            ? "bg-emerald-50 dark:bg-emerald-500/10"
                            : "bg-muted"
                        }`}>
                          <Shield className={`h-4 w-4 ${
                            mfaEnrolled
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {mfaEnrolled ? "Activada" : "No activada"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {mfaEnrolled
                              ? "Tu cuenta requiere segundo factor al iniciar sesión"
                              : "Protege tu cuenta con un segundo factor de verificación"}
                          </p>
                        </div>
                      </div>
                      {!mfaEnrolled ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleEnable2FA()}
                          disabled={mfaBusy}
                        >
                          {mfaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activar"}
                        </Button>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={mfaBusy}>
                              Desactivar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Desactivar 2FA?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tu cuenta será menos segura. Solo hazlo si reconoces este dispositivo.
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
                  </CardContent>
                </Card>

                {/* Active session */}
                <Card className="rounded-2xl">
                  <CardContent className="p-6 space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Sesiones activas</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Dispositivos conectados a tu cuenta</p>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                          <Smartphone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Este dispositivo</p>
                          <p className="text-xs text-muted-foreground">Sesión actual</p>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border-0"
                      >
                        Activa
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ────── PREFERENCES ────── */}
            {activeSection === "preferences" && (
              <div className="space-y-6">
                {/* Language & timezone */}
                <Card className="rounded-2xl">
                  <CardContent className="p-6 space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Idioma y zona horaria</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Personaliza cómo ves la información</p>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Idioma</Label>
                        <Select
                          value={profileData.language}
                          onValueChange={(v) => setProfileData({ ...profileData, language: v })}
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Spanish">Español</SelectItem>
                            <SelectItem value="English">English (parcial)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">La app está principalmente en español</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Zona horaria</Label>
                        <Select
                          value={profileData.timezone}
                          onValueChange={(v) => setProfileData({ ...profileData, timezone: v })}
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="America/Santiago">Chile (Santiago)</SelectItem>
                            <SelectItem value="America/Punta_Arenas">Chile (Magallanes)</SelectItem>
                            <SelectItem value="Pacific/Easter">Chile (Isla de Pascua)</SelectItem>
                            <SelectItem value="America/Argentina/Buenos_Aires">Argentina</SelectItem>
                            <SelectItem value="America/Bogota">Colombia</SelectItem>
                            <SelectItem value="America/Lima">Perú</SelectItem>
                            <SelectItem value="America/Mexico_City">México</SelectItem>
                            <SelectItem value="UTC">UTC</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Moneda de visualización</Label>
                        <Select
                          value={currency}
                          onValueChange={(v) => setCurrency(v as CurrencyCode)}
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CLP">Pesos chilenos (CLP)</SelectItem>
                            <SelectItem value="USD">Dólares (USD)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Se aplica a todos los montos en la app</p>
                      </div>
                    </div>

                    <Button onClick={() => void handleSavePreferences()} disabled={savingPrefs} className="gap-2">
                      {savingPrefs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Guardar preferencias
                    </Button>
                  </CardContent>
                </Card>

                {/* Notifications */}
                <Card className="rounded-2xl">
                  <CardContent className="p-6 space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Notificaciones</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Controla cómo y cuándo te avisamos</p>
                    </div>

                    {/* Push */}
                    <div className="flex items-center justify-between rounded-xl border border-border p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          pushSubscribed
                            ? "bg-blue-50 dark:bg-blue-500/10"
                            : "bg-muted"
                        }`}>
                          <Bell className={`h-4 w-4 ${
                            pushSubscribed
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-muted-foreground"
                          }`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Notificaciones push</p>
                          <p className="text-xs text-muted-foreground">
                            {!pushSupported
                              ? "No soportado en este navegador"
                              : getPushPermission() === "denied"
                                ? "Permiso denegado en el navegador"
                                : pushSubscribed
                                  ? "Recibirás alertas incluso con la app cerrada"
                                  : "Activa para recibir alertas en tiempo real"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {pushSubscribed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleTestPush}
                            disabled={pushTesting || pushLoading}
                            className="text-xs"
                          >
                            {pushTesting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            Probar
                          </Button>
                        )}
                        <Switch
                          checked={pushSubscribed}
                          disabled={!pushSupported || pushLoading}
                          onCheckedChange={() => void handleTogglePush()}
                          aria-label="Notificaciones push"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ────── PRIVACY ────── */}
            {activeSection === "privacy" && (
              <div className="space-y-6">
                <Card className="rounded-2xl">
                  <CardContent className="p-6 space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Consentimientos y privacidad</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Finalidades según Ley 19.628 / CMF. Versión de política:{" "}
                        <span className="font-medium">{privacyPanel?.policyVersion ?? "—"}</span>
                      </p>
                    </div>

                    {/* SFA link */}
                    <Link
                      href="/conexiones"
                      className="flex items-center justify-between rounded-xl border border-border p-4 hover:bg-muted/40 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                          <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Conexiones bancarias (SFA)</p>
                          <p className="text-xs text-muted-foreground">Consentimientos OAuth con tu banco</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </Link>

                    {/* Error */}
                    {privacyConsentError && (
                      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-2">
                        <p className="text-sm text-destructive font-medium">No se pudieron cargar los consentimientos</p>
                        <p className="text-xs text-muted-foreground">{privacyConsentError}</p>
                        <Button variant="outline" size="sm" onClick={() => void loadPrivacyConsents()}>
                          Reintentar
                        </Button>
                      </div>
                    )}

                    {/* Loading */}
                    {privacyLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando consentimientos…
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(privacyPanel?.purposes ?? []).map((row) => {
                          const meta = PRIVACY_LABELS[row.purpose];
                          const busy = privacyBusy === row.purpose;
                          const isRequired =
                            REGISTRATION_REQUIRED_PRIVACY_PURPOSES.includes(row.purpose) && row.accepted;
                          return (
                            <div
                              key={row.purpose}
                              className="flex items-center justify-between rounded-xl border border-border p-4 gap-4"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">{meta?.title ?? row.purpose}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{meta?.description}</p>
                                {row.updatedAt && (
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    Último cambio:{" "}
                                    {new Date(row.updatedAt).toLocaleString("es-CL", {
                                      dateStyle: "short",
                                      timeStyle: "short",
                                    })}{" "}
                                    · v{row.policyVersion ?? "—"}
                                  </p>
                                )}
                                {isRequired && (
                                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                                    Obligatorio para el servicio
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                <Switch
                                  checked={row.accepted}
                                  disabled={busy || isRequired}
                                  onCheckedChange={(c) => handlePrivacyToggle(row.purpose, c === true)}
                                  aria-label={meta?.title ?? row.purpose}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Los cambios quedan registrados en servidor con versión de política, canal e IP.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ────── ACCOUNT ────── */}
            {activeSection === "account" && (
              <div className="space-y-6">
                {/* Plan */}
                <Card className="rounded-2xl">
                  <CardContent className="p-6 space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Tu plan</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Información sobre tu suscripción</p>
                    </div>
                    <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">Plan Gratuito</p>
                        <p className="text-sm text-muted-foreground mt-0.5">Acceso completo a todas las funciones</p>
                      </div>
                      <Badge className="bg-primary/10 text-primary border-0 hover:bg-primary/10">Activo</Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Export */}
                <Card className="rounded-2xl">
                  <CardContent className="p-6 space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Exportar datos</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Descarga una copia de tus datos personales (derecho de portabilidad, Ley 19.628)
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() =>
                        toast({
                          title: "En desarrollo",
                          description: "La exportación de datos estará disponible pronto.",
                        })
                      }
                    >
                      <Download className="h-4 w-4" />
                      Descargar mis datos
                    </Button>
                  </CardContent>
                </Card>

                {/* Logout + Delete */}
                <Card className="rounded-2xl">
                  <CardContent className="p-6 space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Acciones de cuenta</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Cerrar sesión o eliminar tu cuenta</p>
                    </div>
                    <div className="space-y-3">
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-2"
                        onClick={() => logout("personal")}
                      >
                        <LogOut className="h-4 w-4" />
                        Cerrar sesión
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" className="w-full justify-start gap-2 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20 hover:bg-red-50 dark:hover:bg-red-500/10">
                            <Trash2 className="h-4 w-4" />
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
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={handleDeleteAccount}
                            >
                              Eliminar cuenta
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
