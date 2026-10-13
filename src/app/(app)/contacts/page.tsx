import { Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listContacts, listIndustryNames } from "@/lib/contacts/queries";

import { ContactList } from "./contact-list";
import { ContactsFilterBar } from "./contacts-filter-bar";
import { QuickAddDialog } from "./quick-add-dialog";

export default async function ContactsPage(props: PageProps<"/contacts">) {
  const searchParams = await props.searchParams;

  const q = typeof searchParams.q === "string" ? searchParams.q : undefined;
  const role = typeof searchParams.role === "string" ? searchParams.role : undefined;
  const industry = typeof searchParams.industry === "string" ? searchParams.industry : undefined;
  const important = searchParams.important === "1";

  const [contacts, industries] = await Promise.all([
    listContacts({
      q,
      roleType: role === "boss" || role === "non_boss" || role === "unclassified" ? role : undefined,
      industry,
      importantOnly: important,
    }),
    listIndustryNames(),
  ]);

  const hasActiveFilters = Boolean(q || role || industry || important);

  return (
    <div className="flex flex-col">
      <PageHeader title="人脈" description="管理商業與私人聯絡人" actions={<QuickAddDialog />} />
      <ContactsFilterBar industries={industries} />

      {contacts.length === 0 ? (
        <div className="px-4 md:px-6">
          <EmptyState
            icon={Users}
            title={hasActiveFilters ? "找不到符合條件的人脈" : "還沒有任何人脈"}
            description={hasActiveFilters ? "試試調整搜尋或篩選條件。" : "點擊右上角「新增人脈」開始建立第一筆資料。"}
          />
        </div>
      ) : (
        <ContactList contacts={contacts} />
      )}
    </div>
  );
}
