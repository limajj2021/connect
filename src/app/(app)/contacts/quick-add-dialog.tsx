"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";

import { quickAddContact, type ActionState } from "@/lib/contacts/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function QuickAddDialog() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(quickAddContact, initialState);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open the dialog once when arriving via the ⌘K "新增人脈" action
      setOpen(true);
      router.replace("/contacts");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <UserPlus className="size-4" />
        新增人脈
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增人脈</DialogTitle>
          <DialogDescription>只需輸入姓名即可建立，其他資料可以稍後補齊。</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-add-name">姓名</Label>
            <Input id="quick-add-name" name="name" required autoFocus placeholder="例如：王小明" />
          </div>
          {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "建立中…" : "建立"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
