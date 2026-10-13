import { PageHeader } from "@/components/page-header";
import { listContacts } from "@/lib/contacts/queries";
import { createMeeting } from "@/lib/meetings/actions";

import { MeetingForm } from "../meeting-form";

export default async function NewMeetingPage() {
  const contacts = await listContacts();
  const contactOptions = contacts.map((c) => ({ id: c.id, name: c.name, company: c.company }));

  return (
    <div className="flex flex-col">
      <PageHeader title="新增會議紀錄" />
      <div className="px-4 py-6 md:max-w-2xl md:px-6">
        <MeetingForm contactOptions={contactOptions} action={createMeeting} submitLabel="建立" />
      </div>
    </div>
  );
}
