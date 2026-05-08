/**
 * DashboardSkeleton
 *
 * Placeholder UI that mirrors the real dashboard layout while data loads.
 * Replaces the generic spinner with content-shaped skeletons for a
 * faster perceived load time.
 */

import { Skeleton } from "@/components/ui/skeleton";

function ScoreHeroSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center gap-4">
      {/* Semicircular gauge placeholder */}
      <div className="w-48 h-28 sm:w-56 sm:h-32 flex items-end justify-center">
        <Skeleton className="w-40 h-24 rounded-t-full" />
      </div>
      {/* Label + delta */}
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-3.5 w-32" />
      </div>
    </div>
  );
}

function BalanceCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <Skeleton className="h-3.5 w-28" />
      <div className="flex items-baseline gap-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
      <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

function DonutSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-5">
      <Skeleton className="w-24 h-24 rounded-full shrink-0" />
      <div className="flex-1 space-y-2.5">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="w-3 h-3 rounded-full shrink-0" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
      <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-5 w-20 shrink-0" />
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48" />
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-8 w-16 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-40 rounded-lg" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        {/* Score Hero */}
        <ScoreHeroSkeleton />

        {/* Balance */}
        <BalanceCardSkeleton />

        {/* Action Cards */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <ActionCardSkeleton />
          <ActionCardSkeleton />
        </div>

        {/* Flow Donut */}
        <DonutSkeleton />

        {/* Categories */}
        <div className="space-y-3">
          <Skeleton className="h-3 w-36" />
          <CategoryCardSkeleton />
          <CategoryCardSkeleton />
          <CategoryCardSkeleton />
          <CategoryCardSkeleton />
        </div>
      </div>
    </div>
  );
}
