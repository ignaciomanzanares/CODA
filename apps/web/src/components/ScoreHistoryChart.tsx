import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth, getPersonalToken, hasPersonalSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ScoreEntry {
  id: number;
  score: number;
  maxScore: number;
  calculatedAt: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload as ScoreEntry & { label: string };
  return (
    <div className="bg-background border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold">{entry.label}</p>
      <p className="text-primary">
        Score: {entry.score} / {entry.maxScore}
      </p>
    </div>
  );
}

export default function ScoreHistoryChart() {
  const { isAuthenticated } = useAuth();

  const { data, isLoading } = useQuery<{ history: ScoreEntry[] }>({
    queryKey: ["/api/score-history"],
    queryFn: () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession()) return Promise.resolve({ history: [] });
      return apiFetch("/api/score-history", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  const history = data?.history ?? [];
  if (history.length < 2) return null;

  // Deduplicate by date (keep latest per day), reverse to chronological
  const byDay = new Map<string, ScoreEntry>();
  for (const entry of [...history].reverse()) {
    const day = entry.calculatedAt.slice(0, 10);
    byDay.set(day, entry);
  }
  const chartData = [...byDay.values()].map((e) => ({
    ...e,
    label: formatDate(e.calculatedAt),
  }));

  if (chartData.length < 2) return null;

  const scores = chartData.map((d) => d.score);
  const minScore = Math.max(0, Math.min(...scores) - 10);
  const maxScore = Math.min(100, Math.max(...scores) + 10);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Evolución del score</CardTitle>
        <CardDescription>
          Score transaccional en el tiempo ({chartData.length} registros)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
            />
            <YAxis
              domain={[minScore, maxScore]}
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="score"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3, fill: "hsl(var(--primary))" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
