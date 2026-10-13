import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listChatExtractions } from "@/lib/ai-extraction/queries";
import { getChatImport, listChatMessages, listChatParticipants } from "@/lib/chat-import/queries";

import { ChatMessageViewer } from "./chat-message-viewer";
import { ChatSearchBar } from "./chat-search-bar";
import { DeleteChatImportButton } from "./delete-chat-import-button";
import { ExtractionReviewPanel } from "./extraction-review-panel";
import { RunAnalysisButton } from "./run-analysis-button";

export default async function ChatImportDetailPage(props: PageProps<"/records/chats/[id]">) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const chatImport = await getChatImport(id);
  if (!chatImport) notFound();

  const q = typeof searchParams.q === "string" ? searchParams.q : undefined;
  const dateFrom = typeof searchParams.from === "string" ? searchParams.from : undefined;
  const dateTo = typeof searchParams.to === "string" ? searchParams.to : undefined;

  const [participants, messages, extractions] = await Promise.all([
    listChatParticipants(id),
    listChatMessages(id, { q, dateFrom, dateTo }),
    listChatExtractions(id),
  ]);

  const pendingCount = extractions.filter((e) => e.review_status === "pending").length;

  return (
    <div className="flex flex-col">
      <PageHeader
        title={chatImport.source_chat_name ?? chatImport.file_name}
        description={`匯入於 ${new Date(chatImport.imported_at).toLocaleString("zh-TW")}`}
        actions={
          <div className="flex items-center gap-2">
            <RunAnalysisButton chatImportId={chatImport.id} />
            <DeleteChatImportButton chatImportId={chatImport.id} storagePath={chatImport.storage_path} />
          </div>
        }
      />

      <div className="space-y-4 px-4 py-4 md:px-6">
        {participants.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Users className="size-4 text-muted-foreground" />
            {participants.map((p) =>
              p.contact ? (
                <Link key={p.id} href={`/contacts/${p.contact.id}`}>
                  <Badge variant="secondary">{p.display_name}</Badge>
                </Link>
              ) : (
                <Badge key={p.id} variant="outline">
                  {p.display_name}（未連結）
                </Badge>
              ),
            )}
          </div>
        ) : null}

        <Tabs defaultValue="messages">
          <TabsList>
            <TabsTrigger value="messages">對話內容</TabsTrigger>
            <TabsTrigger value="insights">
              AI 擷取結果{pendingCount > 0 ? `（${pendingCount}）` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="messages" className="space-y-4 pt-4">
            <ChatSearchBar />
            {messages.length === 0 ? (
              <EmptyState icon={Users} title="沒有符合條件的訊息" description="可調整搜尋關鍵字或日期範圍。" />
            ) : (
              <div className="rounded-lg border p-4">
                <ChatMessageViewer messages={messages} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="insights" className="pt-4">
            <ExtractionReviewPanel extractions={extractions} chatImportId={chatImport.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
