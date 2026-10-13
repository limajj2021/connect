import { createBrowserClient } from "@supabase/ssr";

// Not generic over `Database`: supabase-js's generated-types machinery expects
// types produced by `supabase gen types` (down to per-table Relationships and
// parsed `select()` strings). There is no live Supabase project to generate
// those from yet, so call sites cast results to the row types in
// `@/types/database` manually instead.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
