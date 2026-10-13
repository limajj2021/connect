import Link from "next/link";
import { Calendar, Clock, MapPin, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { MeetingWithContacts } from "@/lib/meetings/queries";

export function MeetingView({ meeting }: { meeting: MeetingWithContacts }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Calendar className="size-4" />
          {meeting.meeting_date}
        </span>
        {meeting.meeting_time ? (
          <span className="flex items-center gap-1.5">
            <Clock className="size-4" />
            {meeting.meeting_time}
          </span>
        ) : null}
        {meeting.location ? (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4" />
            {meeting.location}
          </span>
        ) : null}
      </div>

      {meeting.contacts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Users className="size-4 text-muted-foreground" />
          {meeting.contacts.map((c) => (
            <Link key={c.id} href={`/contacts/${c.id}`}>
              <Badge variant="secondary">{c.name}</Badge>
            </Link>
          ))}
        </div>
      ) : null}

      {meeting.content ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">會議內容</p>
          <p className="whitespace-pre-wrap text-sm">{meeting.content}</p>
        </div>
      ) : null}
    </div>
  );
}
