"use client";

import { useActionState, useEffect } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { sendDueReminderEmails, type ActionState } from "@/lib/notifications/actions";

const initialState: ActionState = {};

export function SendEmailsButton() {
  const [state, formAction, isPending] = useActionState(sendDueReminderEmails, initialState);

  useEffect(() => {
    if (state === initialState) return;
    if (state.error) toast.error(state.error);
    else if (state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={formAction}>
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        <Mail className="size-4" />
        {isPending ? "寄送中…" : "寄送到期通知"}
      </Button>
    </form>
  );
}
