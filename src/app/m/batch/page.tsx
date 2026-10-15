import { loadBatch } from "@/lib/bot/batch";
import { verifyScope } from "@/lib/mini/token";
import { listTagNames } from "@/lib/mini/tags";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";

import { LinkExpired } from "../link-expired";
import { type BatchRow, MiniBatchForm } from "./mini-batch-form";

export default async function MiniBatchPage(props: PageProps<"/m/batch">) {
  const { t } = await props.searchParams;
  const token = typeof t === "string" ? t : null;
  const lineUserId = process.env.LINE_OWNER_USER_ID;
  if (!verifyScope(token, "batch") || !lineUserId) return <LinkExpired />;

  const supabase = createAdminClient();
  const ownerId = await getOwnerUserId();
  const [entries, tagSuggestions] = await Promise.all([
    loadBatch({ supabase, ownerId, lineUserId }),
    listTagNames(supabase, ownerId),
  ]);
  const rows: BatchRow[] = entries.map((e) => ({
    key: e.key,
    name: e.draft.name ?? "",
    displayName: e.draft.line_display_name ?? null,
    existingName: e.existing?.name ?? null,
  }));
  return <MiniBatchForm token={token!} rows={rows} tagSuggestions={tagSuggestions} />;
}
