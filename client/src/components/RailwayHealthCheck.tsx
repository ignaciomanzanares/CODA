import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { railwayApi } from "@/lib/railwayApi";

export default function RailwayHealthCheck() {
  const { data: health, isLoading, error, refetch } = useQuery({
    queryKey: ['railway-health'],
    queryFn: () => railwayApi.healthCheck(),
    retry: 2,
    refetchInterval: 30000, // Check every 30 seconds
  });

  const isHealthy = health?.status === 'healthy' || health?.status === 'ok';

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Railway API Status:</span>
            {isLoading ? (
              <Badge variant="secondary">
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                Checking...
              </Badge>
            ) : error ? (
              <Badge variant="destructive">
                <XCircle className="w-3 h-3 mr-1" />
                Offline
              </Badge>
            ) : isHealthy ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle className="w-3 h-3 mr-1" />
                Online
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle className="w-3 h-3 mr-1" />
                Error
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {health?.timestamp && (
              <span className="text-xs text-gray-500">
                Last check: {new Date(health.timestamp).toLocaleTimeString()}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>
        
        {error && (
          <div className="mt-2 text-xs text-red-600">
            Unable to connect to Railway API. Please check your network connection.
          </div>
        )}
      </CardContent>
    </Card>
  );
}