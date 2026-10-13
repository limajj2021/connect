"use client";

import { useActionState, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(quickAddContact, initialState);

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
