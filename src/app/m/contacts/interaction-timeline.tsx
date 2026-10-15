import type { InteractionRow } from "@/lib/bot/data";

/** "10/15" from an ISO date, for a compact timeline. */
function shortDate(occurredOn: string) {
  const [, month, day] = occurredOn.split("-");
  return `${Number(month)}/${Number(day)}`;
}

const KIND_STYLE: Record<InteractionRow["kind"], { icon: string; label: string; dot: string }> = {
  chat: { icon: "💬", label: "聊到", dot: "bg-amber-400" },
  post: { icon: "📣", label: "他的動態", dot: "bg-sky-400" },
  sent: { icon: "✉️", label: "已傳", dot: "bg-muted-foreground/40" },
};

/**
 * Full "聊過什麼" history for one person — typed with 交流／聊過, pulled out of
 * an imported chat by AI (溝通節點), or a post of theirs you forwarded —
 * shown as one timeline so a call or meeting can be prepped in a glance.
 */
export function InteractionTimeline({ interactions }: { interactions: InteractionRow[] }) {
  if (interactions.length === 0) return null;
  const shown = interactions.slice(0, 30);
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="text-sm font-semibold">溝通節點</h2>
      <ol className="relative ml-1 space-y-4 border-l border-border pl-4">
        {shown.map((item) => {
          const style = KIND_STYLE[item.kind] ?? KIND_STYLE.chat;
          return (
            <li key={item.id} className="relative text-sm">
              <span className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full ring-4 ring-card ${style.dot}`} />
              <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                <span className="font-medium tabular-nums">{shortDate(item.occurred_on)}</span>
                <span>
                  {style.icon} {style.label}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap">{item.content}</p>
              {item.source_url ? (
                <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-xs text-sky-600 underline">
                  看原文
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
      {interactions.length > shown.length ? (
        <p className="text-xs text-muted-foreground">…還有 {interactions.length - shown.length} 筆較舊的紀錄</p>
      ) : null}
    </section>
  );
}
