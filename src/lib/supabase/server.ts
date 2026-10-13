import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Not generic over `Database` — see the comment in `./client.ts`.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — session refresh is handled by
            // middleware, so writes here can be safely ignored.
          }
        },
      },
    },
  );
}

// Verifies the session's JWT locally (asymmetric signing keys, cached JWKS)
// instead of round-tripping to Supabase Auth like `auth.getUser()` does.
export async function getAuthUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
