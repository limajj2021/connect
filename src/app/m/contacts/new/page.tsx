import { verifyScope } from "@/lib/mini/token";

import { LinkExpired } from "../../link-expired";
import { MiniContactForm } from "../mini-contact-form";

export default async function MiniNewContactPage(props: PageProps<"/m/contacts/new">) {
  const { t, name } = await props.searchParams;
  const token = typeof t === "string" ? t : null;
  if (!verifyScope(token, "contact:new")) return <LinkExpired />;
  return <MiniContactForm token={token!} contact={null} prefillName={typeof name === "string" ? name : undefined} />;
}
