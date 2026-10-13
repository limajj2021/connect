"use client";

import { Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { runAiAnalysis } from "@/lib/ai-extraction/actions";

export function RunAnalysisButton({ chatImportId }: { chatImportId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleRun() {
    startTransition(async () => {
      const result = await runAiAnalysis(chatImportId);
      if (result.error) toast.error(result.error);
      else if (result.message) toast.success(result.message);
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleRun}>
      <Sparkles className="size-4" />
      {isPending ? "分析中…" : "執行 AI 分析"}
    </Button>
  );
}
