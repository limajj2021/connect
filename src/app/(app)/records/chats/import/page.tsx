import { PageHeader } from "@/components/page-header";
import { listContacts } from "@/lib/contacts/queries";

import { ImportWizard } from "./import-wizard";

export default async function ImportChatPage() {
  const contacts = await listContacts();
  const contactOptions = contacts.map((c) => ({ id: c.id, name: c.name, company: c.company }));

  return (
    <div className="flex flex-col">
      <PageHeader title="匯入 LINE 聊天記錄" description="上傳 LINE 匯出的 TXT 檔案，預覽並確認後匯入" />
      <div className="px-4 py-6 md:px-6">
        <ImportWizard contactOptions={contactOptions} />
      </div>
    </div>
  );
}
