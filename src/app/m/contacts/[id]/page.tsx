import { verifyScope } from "@/lib/mini/token";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";
import type { ContactRow } from "@/types/database";

import { LinkExpired } from "../../link-expired";
import { MiniContactForm } from "../mini-contact-form";

export default async function MiniEditContactPage(props: PageProps<"/m/contacts/[id]">) {
  const { id } = await props.params;
  const { t } = await props.searchParams;
  const token = typeof t === "string" ? t : null;
  if (!verifyScope(token, `contact:${id}`)) return <LinkExpired />;

  const { data } = await createAdminClient()
    .from("contacts")
    .select("*")
    .eq("owner_id", await getOwnerUserId())
    .eq("id", id)
    .maybeSingle();
  if (!data) return <p className="p-6 text-center text-sm text-muted-foreground">這位人脈已被刪除。</p>;

  return <MiniContactForm token={token!} contact={data as ContactRow} />;
}
