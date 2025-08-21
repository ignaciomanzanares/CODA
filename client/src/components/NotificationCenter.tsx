import { useState } from 'react';
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
import type { Notification } from '@shared/schema';

interface NotificationCenterProps {
  className?: string;
}

export default function NotificationCenter({ className }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Mock API functions for notifications (these would be added to useApi)
  const getNotifications = async (_options?: { category?: string; unreadOnly?: boolean }) => {
    // Mock implementation - in real app this would come from the API
    return [
      {
        id: 1,
        title: 'New Bill Split Created',
        message: '"Dinner at restaurant" has been created for $120.00. Check your share!',
        type: 'info',
        category: 'bill_split',
        isRead: false,
        actionUrl: '/bill-split',
        createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
        metadata: { billSplitId: 1 }
      },
      {
        id: 2,
        title: 'Credit Score Updated',
        message: 'Your credit score is now 750 (+15 points).',
        type: 'success',
        category: 'credit_score',
        isRead: false,
        actionUrl: '/dashboard',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
        metadata: { newScore: 750, change: 15 }
      },
      {
        id: 3,
        title: 'Goal Milestone Reached',
        message: "Great job! You've reached 75% of your \"Emergency Fund\" goal.",
        type: 'success',
        category: 'goal',
        isRead: true,
        actionUrl: '/goals',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
        metadata: { goalId: 1, progress: 75 }
      },
      {
        id: 4,
        title: 'Unusual Spending Detected',
        message: 'You spent $350.00 on Entertainment, which is higher than usual.',
        type: 'warning',
        category: 'expense',
        isRead: true,
        actionUrl: '/expenses',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
        metadata: { amount: 350, category: 'Entertainment' }
      }
    ] as Notification[];
  };

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', activeTab],
    queryFn: () => getNotifications({
      category: activeTab === 'all' ? undefined : activeTab,
      unreadOnly: activeTab === 'unread'
    }),
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Mock mutations (these would also be in useApi)
  const markAsReadMutation = useMutation({
    mutationFn: async (_notificationId: number) => {

      // Mock implementation
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Notification marked as read',
        variant: 'default'
      });
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      // Mock implementation
      await new Promise(resolve => setTimeout(resolve, 1000));
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'All notifications marked as read',
        variant: 'default'
      });
    }
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (_notificationId: number) => {
      // Mock implementation
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Notification deleted',
        variant: 'default'
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
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.actionUrl) {
      // In real app, navigate to the URL
      window.location.href = notification.actionUrl;
    }
    setIsOpen(false);
  };

  const filteredNotifications = notifications.filter(notification => {
    if (activeTab === 'all') return true;
    if (activeTab === 'unread') return !notification.isRead;
    return notification.category === activeTab;
  });

  return (
    <div className={className}>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </DialogTrigger>
        
        <DialogContent className="max-w-2xl max-h-[600px] p-0">
          <DialogHeader className="p-6 pb-4">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
                {unreadCount > 0 && (
                  <Badge variant="secondary">{unreadCount} new</Badge>
                )}
              </DialogTitle>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAllAsReadMutation.mutate()}
                    disabled={markAllAsReadMutation.isPending}
                  >
                    <CheckCheck className="h-4 w-4 mr-2" />
                    Mark all read
                  </Button>
                )}
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="px-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unread" className="relative">
                  Unread
                  {unreadCount > 0 && (
                    <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-xs">
                      {unreadCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="bill_split">Bills</TabsTrigger>
                <TabsTrigger value="credit_score">Credit</TabsTrigger>
                <TabsTrigger value="goal">Goals</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-4 max-h-[400px] overflow-y-auto">
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
                ) : filteredNotifications.length === 0 ? (
                  <div className="text-center py-12">
                    <BellOff className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">
                      {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredNotifications.map((notification) => (
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
                              <div className={`p-2 rounded-full ${getTypeColor(notification.type)}`}>
                                {getNotificationIcon(notification.type)}
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
                                  <span className="text-lg">{getCategoryIcon(notification.category)}</span>
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">
                                {truncateText(notification.message, 100)}
                              </p>
                              <div className="flex items-center justify-between">
                                <Badge variant="outline" className="text-xs capitalize">
                                  {notification.category.replace('_', ' ')}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  {!notification.isRead && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        markAsReadMutation.mutate(notification.id);
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
                                      deleteNotificationMutation.mutate(notification.id);
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

          <div className="p-6 pt-4 border-t">
            <div className="text-center">
              <p className="text-sm text-gray-500">
                Manage notification preferences in your{' '}
                <Button variant="link" className="p-0 h-auto text-blue-600">
                  profile settings
                </Button>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
