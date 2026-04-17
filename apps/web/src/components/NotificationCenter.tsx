import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Check, CheckCheck, X, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { formatRelativeTime, truncateText } from '@/lib/utils';
import type { Notification } from '@/types';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocation } from 'wouter';
import { ROUTES } from '@/lib/routes';

interface NotificationCenterProps {
  className?: string;
}

export default function NotificationCenter({ className }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const {
    getNotifications, 
    markNotificationAsRead, 
    markAllNotificationsAsRead, 
    deleteNotification
  } = useApi();

  // Get all notifications for counting and filtering
  const { data: allNotifications = [], isLoading: allNotificationsLoading } = useQuery<Notification[]>({
    queryKey: ['notifications', 'all'],
    queryFn: () => getNotifications({}),
    enabled: isAuthenticated && !authLoading,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  // Get filtered notifications for the active tab
  const { data: filteredNotifications = [], isLoading: filteredLoading } = useQuery<Notification[]>({
    queryKey: ['notifications', activeTab],
    queryFn: () => {
      if (activeTab === 'all') {
        return getNotifications({});
      } else if (activeTab === 'unread') {
        return getNotifications({ unreadOnly: true });
      } else {
        return getNotifications({ category: activeTab });
      }
    },
    enabled: isAuthenticated && !authLoading && activeTab !== 'all',
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const notifications = activeTab === 'all' ? allNotifications : filteredNotifications;
  const isLoading = activeTab === 'all' ? allNotificationsLoading : filteredLoading;
  const unreadCount = allNotifications.filter((n: Notification) => !n.isRead).length;

  // Force a fresh fetch every time the dialog is opened or tab changes
  useEffect(() => {
    if (isOpen) {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      // Also invalidate the active tab specifically for quick refresh
      queryClient.invalidateQueries({ queryKey: ['notifications', activeTab] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab]);

  const markAsReadMutation = useMutation({
    mutationFn: markNotificationAsRead,
    onMutate: async (notificationId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      
      // Snapshot the previous values
      const previousAll = queryClient.getQueryData<Notification[]>(['notifications', 'all']);
      const previousFiltered = queryClient.getQueryData<Notification[]>(['notifications', activeTab]);
      
      // Optimistically update to the new value in "all"
      if (previousAll) {
        const updatedAll = previousAll.map(notification => 
          notification.id === Number(notificationId)
            ? { ...notification, isRead: true, readAt: new Date() }
            : notification
        );
        queryClient.setQueryData<Notification[]>(['notifications', 'all'], updatedAll);
      }
      
      // For filtered tabs, special-case the 'unread' tab by removing the item immediately
      if (previousFiltered && activeTab !== 'all') {
        let updatedFiltered: Notification[];
        if (activeTab === 'unread') {
          updatedFiltered = previousFiltered.filter(n => n.id !== Number(notificationId));
        } else {
          updatedFiltered = previousFiltered.map(notification => 
            notification.id === Number(notificationId)
              ? { ...notification, isRead: true, readAt: new Date() }
              : notification
          );
        }
        queryClient.setQueryData<Notification[]>(['notifications', activeTab], updatedFiltered);
      }
      
      return { previousAll, previousFiltered };
    },
    onSuccess: () => {
      // No refetch needed; cache already updated optimistically
      toast({
        title: 'Notificación marcada como leída',
        variant: 'default'
      });
    },
    onError: (error, notificationId, context) => {
      // Rollback optimistic updates on error
      if (context?.previousAll) {
        queryClient.setQueryData(['notifications', 'all'], context.previousAll);
      }
      if (context?.previousFiltered) {
        queryClient.setQueryData(['notifications', activeTab], context.previousFiltered);
      }
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo marcar la notificación como leída',
        variant: 'destructive'
      });
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const previousAll = queryClient.getQueryData<Notification[]>(['notifications', 'all']);
      const previousFiltered = queryClient.getQueryData<Notification[]>(['notifications', activeTab]);

      if (previousAll) {
        const updatedAll = previousAll.map(n => ({ ...n, isRead: true, readAt: new Date() }));
        queryClient.setQueryData<Notification[]>(['notifications', 'all'], updatedAll);
      }
      if (previousFiltered && activeTab === 'unread') {
        // Clear unread tab immediately for better UX
        queryClient.setQueryData<Notification[]>(['notifications', 'unread'], []);
      }
      return { previousAll, previousFiltered };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Todas las notificaciones marcadas como leídas',
        variant: 'default'
      });
    },
    onError: (error, _vars, context) => {
      // Roll back optimistic changes
      if (context?.previousAll) {
        queryClient.setQueryData(['notifications', 'all'], context.previousAll);
      }
      if (context?.previousFiltered) {
        queryClient.setQueryData(['notifications', activeTab], context.previousFiltered);
      }
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo marcar todas como leídas',
        variant: 'destructive'
      });
    }
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: deleteNotification,
    onMutate: async (notificationId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      
      // Snapshot the previous values
      const previousAll = queryClient.getQueryData<Notification[]>(['notifications', 'all']);
      const previousFiltered = queryClient.getQueryData<Notification[]>(['notifications', activeTab]);
      
      // Optimistically update to the new value
      if (previousAll) {
        const updatedAll = previousAll.filter(notification => notification.id !== notificationId);
        queryClient.setQueryData<Notification[]>(['notifications', 'all'], updatedAll);
      }
      
      if (previousFiltered && activeTab !== 'all') {
        const updatedFiltered = previousFiltered.filter(notification => notification.id !== notificationId);
        queryClient.setQueryData<Notification[]>(['notifications', activeTab], updatedFiltered);
      }
      
      return { previousAll, previousFiltered };
    },
    onSuccess: () => {
      // No refetch needed; cache already updated optimistically
      toast({
        title: 'Notificación eliminada',
        variant: 'default'
      });
    },
    onError: (error, notificationId, context) => {
      // Rollback optimistic updates on error
      if (context?.previousAll) {
        queryClient.setQueryData(['notifications', 'all'], context.previousAll);
      }
      if (context?.previousFiltered) {
        queryClient.setQueryData(['notifications', activeTab], context.previousFiltered);
      }
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo eliminar la notificación',
        variant: 'destructive'
      });
    }
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bill_split':
        return '🧾';
      case 'credit_score':
        return '📊';
      case 'goal':
        return '🎯';
      case 'expense':
        return '💰';
      case 'security':
        return '🔒';
      case 'product':
        return '🏦';
      default:
        return '📩';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'info':
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      case 'info':
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(Number(notification.id) as any);
    }
    if (notification.actionUrl) {
      // In real app, navigate to the URL
      window.location.href = String(notification.actionUrl ?? '');
    }
    setIsOpen(false);
  };

  // Notifications are already filtered by the query, so we don't need to filter them again
  const displayNotifications = notifications;

  // Don't render the component if user is not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={className}>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <div className="relative inline-flex">
            <Button variant="ghost" size="sm">
              <Bell className="h-5 w-5" />
            </Button>
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] px-1 flex items-center justify-center text-[10px] font-bold pointer-events-none"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </div>
        </DialogTrigger>
        
        <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] sm:w-full max-h-notification-panel flex flex-col gap-0 overflow-hidden rounded-t-2xl p-0 sm:rounded-lg">
          <DialogHeader className="shrink-0 space-y-3 p-4 pb-3 sm:p-6 sm:pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-left">
                <Bell className="h-5 w-5 shrink-0" />
                <span>Notificaciones</span>
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="shrink-0">{unreadCount} nuevas</Badge>
                )}
              </DialogTitle>
              <div className="flex flex-wrap items-center justify-end gap-2 sm:min-w-0 sm:flex-1 sm:justify-end">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAllAsReadMutation.mutate()}
                    disabled={markAllAsReadMutation.isPending}
                    className="min-h-[44px] shrink-0 max-w-full sm:max-w-none"
                    title="Marcar todas como leídas"
                  >
                    <CheckCheck className="h-4 w-4 mr-2 shrink-0" />
                    <span className="truncate sm:whitespace-normal">
                      <span className="sm:hidden">Marcar leídas</span>
                      <span className="hidden sm:inline">Marcar todas como leídas</span>
                    </span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[44px] shrink-0"
                  aria-label="Ajustes de notificaciones"
                  onClick={() => { setIsOpen(false); navigate(ROUTES.perfil); }}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto scroll-touch-momentum px-4 pb-[calc(var(--sab)+1rem)] sm:px-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">Todas</TabsTrigger>
                <TabsTrigger value="unread" className="relative">
                  No leídas
                  {unreadCount > 0 && (
                    <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-xs">
                      {unreadCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="bill_split">Cuentas</TabsTrigger>
                <TabsTrigger value="credit_score">Crédito</TabsTrigger>
                <TabsTrigger value="goal">Metas</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-4 pb-2">
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <Card key={i} className="animate-pulse">
                        <CardContent className="p-4">
                          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-full"></div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : displayNotifications.length === 0 ? (
                  <div className="text-center py-12">
                    <BellOff className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">
                      {activeTab === 'unread' ? 'No hay notificaciones sin leer' : 'Aún no hay notificaciones'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayNotifications.map((notification: Notification) => (
                      <Card 
                        key={notification.id}
                        className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                          !notification.isRead ? 'border-l-4 border-l-blue-500 bg-blue-50/30' : ''
                        }`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              <div className={`p-2 rounded-full ${getTypeColor(String(notification.type ?? 'info'))}`}>
                                {getNotificationIcon(String(notification.type ?? 'info'))}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-1">
                                <p className="font-semibold text-sm text-gray-900 truncate">
                                  {notification.title}
                                </p>
                                <div className="flex items-center gap-1 ml-2">
                                  <span className="text-xs text-gray-500 whitespace-nowrap">
                                    {notification.createdAt ? formatRelativeTime(notification.createdAt) : 'N/A'}
                                  </span>
                                  <span className="text-lg">{getCategoryIcon(String(notification.category ?? ''))}</span>
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">
                                {truncateText(String(notification.message ?? ''), 100)}
                              </p>
                              <div className="flex items-center justify-between">
                                  <Badge variant="outline" className="text-xs capitalize">
                                  {(notification.category ?? '').replace('_', ' ')}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  {!notification.isRead && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        markAsReadMutation.mutate(Number(notification.id) as any);
                                      }}
                                      disabled={markAsReadMutation.isPending}
                                      className="h-6 w-6 p-0"
                                    >
                                      <Check className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteNotificationMutation.mutate(Number(notification.id) as any);
                                    }}
                                    disabled={deleteNotificationMutation.isPending}
                                    className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="p-4 sm:p-6 pt-3 sm:pt-4 border-t shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
            <div className="text-center">
              <p className="text-sm text-gray-500">
                Gestiona las preferencias de notificaciones en tu{' '}
                <Button
                  variant="link"
                  className="p-0 h-auto text-blue-600"
                  onClick={() => { setIsOpen(false); navigate(ROUTES.perfil); }}
                >
                  configuración de perfil
                </Button>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
