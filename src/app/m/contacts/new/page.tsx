import { verifyScope } from "@/lib/mini/token";
import { listTagNames } from "@/lib/mini/tags";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";

import { LinkExpired } from "../../link-expired";
import { MiniContactForm } from "../mini-contact-form";

export default async function MiniNewContactPage(props: PageProps<"/m/contacts/new">) {
  const { t, name, back } = await props.searchParams;
  const token = typeof t === "string" ? t : null;
  if (!verifyScope(token, "contact:new")) return <LinkExpired />;
  const tagSuggestions = await listTagNames(createAdminClient(), await getOwnerUserId());
  return (
    <MiniContactForm
      token={token!}
      contact={null}
      prefillName={typeof name === "string" ? name : undefined}
      tags={[]}
      tagSuggestions={tagSuggestions}
      returnTo={back === "list" ? "/m/contacts" : undefined}
    />
  );
}
