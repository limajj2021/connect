import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

// Shown by the routes' loading.tsx files the instant a nav link is clicked,
// while the page's Supabase queries are still in flight on the server.
export function PageSkeleton({ title, description, rows = 6 }: { title?: string; description?: string; rows?: number }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-live="polite">
      {title ? (
        <PageHeader title={title} description={description} />
      ) : (
        <div className="space-y-2 border-b px-4 py-4 md:px-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      )}
      <div className="space-y-3 px-4 py-4 md:px-6">
        <Skeleton className="h-9 w-full max-w-md" />
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <span className="sr-only">載入中…</span>
    </div>
  );
}
