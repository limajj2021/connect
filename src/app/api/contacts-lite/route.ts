import { NextResponse } from "next/server";

import { listContactsLite } from "@/lib/contacts/queries";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const contacts = await listContactsLite();
  return NextResponse.json(contacts);
}
