import { greetingText, type GreetingKind } from "@/lib/bot/templates";
import { lineShareUrl, whatsappUrl } from "@/lib/line/links";
import { verifyScope } from "@/lib/mini/token";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";

import { LinkExpired } from "../link-expired";
import { SendFlow } from "./send-flow";

const CHANNELS = ["line", "whatsapp", "wechat"] as const;
const KINDS: GreetingKind[] = ["birthday", "festival", "hello"];

/**
 * One screen for "send this greeting": LINE tries liff.shareTargetPicker()
 * for a real completion signal; WhatsApp/WeChat show a one-tap confirm right
 * after the action instead of a stale quick-reply days later. Message text
 * is computed here the same way the bot's own cards do, not passed in the URL.
 */
export default async function MiniSendPage(props: PageProps<"/m/send">) {
  const sp = await props.searchParams;
  const contactId = typeof sp.contact === "string" ? sp.contact : "";
  const token = typeof sp.t === "string" ? sp.t : null;
  if (!contactId || !verifyScope(token, `send:${contactId}`)) return <LinkExpired />;

  const channel = CHANNELS.find((c) => c === sp.ch) ?? "line";
  const kind = KINDS.find((k) => k === sp.k) ?? "hello";
  const occasionName = typeof sp.o === "string" ? sp.o : undefined;
  const variant = Number(sp.v ?? 0) || 0;
  const reminderId = typeof sp.r === "string" ? sp.r : undefined;

  const supabase = createAdminClient();
  const ownerId = await getOwnerUserId();
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name, name_en, salutation, greeting_tone, title, role_type, phone, whatsapp_phone, wechat_id")
    .eq("owner_id", ownerId)
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return <p className="p-6 text-center text-sm text-muted-foreground">這位人脈已被刪除。</p>;

  const messageText = greetingText(kind, contact, variant, occasionName);
  const channelLabel = { line: "LINE", whatsapp: "WhatsApp", wechat: "WeChat" }[channel];
  const occasionLabel = kind === "festival" ? (occasionName ?? "節日") : kind === "birthday" ? "生日" : "問候";

  let waUrl: string | null = null;
  if (channel === "whatsapp") {
    const phone = contact.whatsapp_phone || contact.phone;
    waUrl = phone ? whatsappUrl(phone, messageText) : null;
    if (!waUrl) {
      return (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {contact.name} 還沒有 WhatsApp 號碼{phone ? "（號碼格式看起來不對）" : ""}，先到編輯表單補上。
        </p>
      );
    }
  }

  return (
    <SendFlow
      token={token!}
      contactId={contact.id}
      contactName={contact.name}
      channel={channel}
      messageText={messageText}
      channelLabel={channelLabel}
      occasionLabel={occasionLabel}
      waUrl={waUrl}
      lineUrl={lineShareUrl(messageText)}
      reminderId={reminderId}
    />
  );
}
