import { verifyScope } from "@/lib/mini/token";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";
import { taipeiToday } from "@/lib/format-date";

import { LinkExpired } from "../../link-expired";
import { MiniTaskForm } from "./mini-task-form";

export default async function MiniNewTaskPage(props: PageProps<"/m/tasks/new">) {
  const { t, contact } = await props.searchParams;
  const token = typeof t === "string" ? t : null;
  if (!verifyScope(token, "task:new")) return <LinkExpired />;

  const { data } = await createAdminClient()
    .from("contacts")
    .select("id, name")
    .eq("owner_id", await getOwnerUserId())
    .order("name");

  return (
    <MiniTaskForm
      token={token!}
      today={taipeiToday()}
      contacts={(data ?? []) as { id: string; name: string }[]}
      defaultContactId={typeof contact === "string" ? contact : ""}
    />
  );
}
