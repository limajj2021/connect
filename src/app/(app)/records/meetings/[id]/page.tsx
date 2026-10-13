import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { listContacts } from "@/lib/contacts/queries";
import { getMeeting } from "@/lib/meetings/queries";

import { MeetingDetailClient } from "./meeting-detail-client";

export default async function MeetingDetailPage(props: PageProps<"/records/meetings/[id]">) {
  const { id } = await props.params;
  const [meeting, contacts] = await Promise.all([getMeeting(id), listContacts()]);

  if (!meeting) {
    notFound();
  }

  const contactOptions = contacts.map((c) => ({ id: c.id, name: c.name, company: c.company }));

  return (
    <div className="flex flex-col">
      <PageHeader title="會議紀錄" />
      <div className="px-4 py-6 md:max-w-2xl md:px-6">
        <MeetingDetailClient meeting={meeting} contactOptions={contactOptions} />
      </div>
    </div>
  );
}
