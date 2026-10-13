import Link from "next/link";
import { Calendar, MapPin, Users } from "lucide-react";

import type { MeetingWithContacts } from "@/lib/meetings/queries";

export function MeetingList({ meetings }: { meetings: MeetingWithContacts[] }) {
  return (
    <ul className="divide-y">
      {meetings.map((meeting) => (
        <li key={meeting.id}>
          <Link
            href={`/records/meetings/${meeting.id}`}
            className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-accent/50 md:px-6"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{meeting.title}</span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="size-3.5" />
                {meeting.meeting_date}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {meeting.location ? (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {meeting.location}
                </span>
              ) : null}
              {meeting.contacts.length > 0 ? (
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" />
                  {meeting.contacts.map((c) => c.name).join("、")}
                </span>
              ) : null}
            </div>
            {meeting.content ? <p className="line-clamp-1 text-sm text-muted-foreground">{meeting.content}</p> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
