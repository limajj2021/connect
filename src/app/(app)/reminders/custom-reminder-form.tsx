"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import type { ContactOption } from "@/components/contact-multi-select";
import { ContactCombobox } from "@/components/contact-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomReminder, type ActionState } from "@/lib/reminders/actions";

const initialState: ActionState = {};

export function CustomReminderForm({ contactOptions }: { contactOptions: ContactOption[] }) {
  const [state, formAction, isPending] = useActionState(createCustomReminder, initialState);
  const [contactId, setContactId] = useState<string | null>(null);

  useEffect(() => {
    if (state !== initialState && !state.error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the combobox after a successful submit
      setContactId(null);
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="w-full md:w-48">
        <ContactCombobox name="contact_id" options={contactOptions} value={contactId} onChange={setContactId} />
      </div>
      <Input name="notes" placeholder="提醒內容" required className="w-full md:w-auto md:min-w-40 md:flex-1" />
      <Input name="due_date" type="date" required className="w-full md:w-36" />
      <Button type="submit" size="sm" disabled={isPending}>
        <Plus className="size-4" />
        新增提醒
      </Button>
      {state?.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
