import { verifyScope } from "@/lib/mini/token";
import { contactTagNames, listTagNames } from "@/lib/mini/tags";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";
import type { ContactRow } from "@/types/database";

import { LinkExpired } from "../../link-expired";
import { MiniContactForm } from "../mini-contact-form";

export default async function MiniEditContactPage(props: PageProps<"/m/contacts/[id]">) {
  const { id } = await props.params;
  const { t, back } = await props.searchParams;
  const token = typeof t === "string" ? t : null;
  if (!verifyScope(token, `contact:${id}`)) return <LinkExpired />;

  const supabase = createAdminClient();
  const ownerId = await getOwnerUserId();
  const { data } = await supabase.from("contacts").select("*").eq("owner_id", ownerId).eq("id", id).maybeSingle();
  if (!data) return <p className="p-6 text-center text-sm text-muted-foreground">這位人脈已被刪除。</p>;
  const [tags, tagSuggestions] = await Promise.all([contactTagNames(supabase, id), listTagNames(supabase, ownerId)]);

  return (
    <MiniContactForm
      token={token!}
      contact={data as ContactRow}
      tags={tags}
      tagSuggestions={tagSuggestions}
      returnTo={back === "list" ? "/m/contacts" : undefined}
    />
  );
}
