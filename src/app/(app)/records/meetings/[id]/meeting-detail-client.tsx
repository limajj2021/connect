"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

import type { ContactOption } from "@/components/contact-multi-select";
import { Button } from "@/components/ui/button";
import { updateMeeting, type ActionState } from "@/lib/meetings/actions";
import type { MeetingWithContacts } from "@/lib/meetings/queries";

import { MeetingDeleteButton } from "./meeting-delete-button";
import { MeetingForm } from "../meeting-form";
import { MeetingView } from "./meeting-view";

export function MeetingDetailClient({
  meeting,
  contactOptions,
}: {
  meeting: MeetingWithContacts;
  contactOptions: ContactOption[];
}) {
  const [editing, setEditing] = useState(false);
  const boundUpdate = (prev: ActionState, formData: FormData) => updateMeeting(meeting.id, prev, formData);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold">{meeting.title}</h2>
        {!editing ? (
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" onClick={() => setEditing(true)} aria-label="編輯">
              <Pencil className="size-4" />
            </Button>
            <MeetingDeleteButton meetingId={meeting.id} title={meeting.title} />
          </div>
        ) : null}
      </div>

      {editing ? (
        <MeetingForm
          meeting={meeting}
          contactOptions={contactOptions}
          action={boundUpdate}
          onCancel={() => setEditing(false)}
          onSuccess={() => setEditing(false)}
        />
      ) : (
        <MeetingView meeting={meeting} />
      )}
    </div>
  );
}
