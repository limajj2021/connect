"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { updateContact, type ActionState } from "@/lib/contacts/actions";
import type { ContactWithIndustries } from "@/lib/contacts/queries";

import { ContactForm } from "./contact-form";
import { ContactView } from "./contact-view";
import { DeleteContactButton } from "./delete-contact-button";
import { LineContactButton } from "./line-contact-button";

export function ContactDetailClient({
  contact,
  industrySuggestions,
}: {
  contact: ContactWithIndustries;
  industrySuggestions: string[];
}) {
  const [editing, setEditing] = useState(false);

  const boundUpdate = (prev: ActionState, formData: FormData) => updateContact(contact.id, prev, formData);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{contact.name}</h2>
        </div>
        {!editing ? (
          <div className="flex items-center gap-1">
            <LineContactButton displayName={contact.line_display_name} lineUrl={contact.line_url} />
            <Button type="button" variant="outline" size="icon" onClick={() => setEditing(true)} aria-label="編輯">
              <Pencil className="size-4" />
            </Button>
            <DeleteContactButton contactId={contact.id} name={contact.name} />
          </div>
        ) : null}
      </div>

      {editing ? (
        <ContactForm
          contact={contact}
          industrySuggestions={industrySuggestions}
          action={boundUpdate}
          onCancel={() => setEditing(false)}
          onSuccess={() => setEditing(false)}
        />
      ) : (
        <ContactView contact={contact} />
      )}
    </div>
  );
}
