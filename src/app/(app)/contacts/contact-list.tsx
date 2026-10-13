import Link from "next/link";
import { Star } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ContactWithIndustries } from "@/lib/contacts/queries";

const ROLE_LABEL: Record<string, string> = {
  boss: "老闆",
  non_boss: "非老闆",
  unclassified: "未分類",
};

function initials(name: string) {
  return name.trim().slice(0, 2);
}

export function ContactList({ contacts }: { contacts: ContactWithIndustries[] }) {
  return (
    <ul className="divide-y">
      {contacts.map((contact) => (
        <li key={contact.id}>
          <Link
            href={`/contacts/${contact.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50 md:px-6"
          >
            <Avatar className="size-9 shrink-0">
              <AvatarFallback>{initials(contact.name_en || contact.name)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{contact.name}</span>
                {contact.is_important ? (
                  <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                ) : null}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {[contact.title, contact.company].filter(Boolean).join(" · ") || "尚無公司資訊"}
              </p>
            </div>

            <div className="hidden shrink-0 flex-wrap items-center gap-1 sm:flex">
              {contact.industries.slice(0, 2).map((ind) => (
                <Badge key={ind} variant="secondary">
                  {ind}
                </Badge>
              ))}
            </div>

            <Badge variant="outline" className="hidden shrink-0 md:inline-flex">
              {ROLE_LABEL[contact.role_type]}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
