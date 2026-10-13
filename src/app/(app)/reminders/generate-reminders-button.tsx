"use client";

import { useActionState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { runGenerateReminders, type ActionState } from "@/lib/reminders/actions";

const initialState: ActionState = {};

export function GenerateRemindersButton() {
  const [state, formAction, isPending] = useActionState(runGenerateReminders, initialState);

  useEffect(() => {
    if (state === initialState) return;
    if (state.error) toast.error(state.error);
    else if (state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={formAction}>
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        <RefreshCw className="size-4" />
        {isPending ? "產生中…" : "產生本年度提醒"}
      </Button>
    </form>
  );
}
