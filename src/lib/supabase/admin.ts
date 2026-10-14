import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client for server jobs that run without a signed-in browser
// session (the LINE webhook and the daily LINE push). It bypasses RLS, so every
// caller must scope reads/writes to the owner explicitly (see getOwnerUserId).
let adminClient: SupabaseClient | null = null;

export function isAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return adminClient;
}

let ownerIdCache: string | null = null;

/** The single owner's auth user id, looked up once by OWNER_EMAIL. */
export async function getOwnerUserId(): Promise<string> {
  if (ownerIdCache) return ownerIdCache;
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();
  if (!ownerEmail) throw new Error("OWNER_EMAIL is not set");

  const admin = createAdminClient();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === ownerEmail);
    if (match) {
      ownerIdCache = match.id;
      return match.id;
    }
    if (data.users.length < 100) break;
  }
  throw new Error("Owner user not found for OWNER_EMAIL");
}
