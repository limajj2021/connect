"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { quickAddTask, type ActionState } from "@/lib/tasks/actions";

const initialState: ActionState = {};

export function QuickAddTaskForm({ contactId }: { contactId?: string }) {
  const [state, formAction, isPending] = useActionState(quickAddTask, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state !== initialState && !state.error) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
      {contactId ? <input type="hidden" name="contact_id" value={contactId} /> : null}
      <Input name="title" placeholder="新增待辦事項" required className="min-w-40 flex-1" />
      <Input name="due_date" type="date" className="w-36" />
      <Button type="submit" size="sm" disabled={isPending}>
        <Plus className="size-4" />
        新增
      </Button>
      {state?.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
