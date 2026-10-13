"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteChatImport } from "@/lib/chat-import/actions";

export function DeleteChatImportButton({ chatImportId, storagePath }: { chatImportId: string; storagePath: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Trash2 className="size-4" />
        刪除此批次
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>刪除這筆聊天匯入？</AlertDialogTitle>
          <AlertDialogDescription>
            將一併刪除原始檔案、解析後的訊息，以及此批次衍生的 AI
            擷取結果。已確認寫入人脈資料的內容（例如建立的人脈、待辦事項）不會被移除。此操作無法復原。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={() => startTransition(() => deleteChatImport(chatImportId, storagePath))}
          >
            確認刪除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
