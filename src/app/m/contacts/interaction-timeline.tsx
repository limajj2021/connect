import type { InteractionRow } from "@/lib/bot/data";

/** "10/15" from an ISO date, for a compact timeline. */
function shortDate(occurredOn: string) {
  const [, month, day] = occurredOn.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/**
 * Full "聊過什麼" history for one person — recorded in LINE with 交流／聊過,
 * shown here so a call or meeting can be prepped in a glance before it starts.
 */
export function InteractionTimeline({ interactions }: { interactions: InteractionRow[] }) {
  if (interactions.length === 0) return null;
  const shown = interactions.slice(0, 20);
  return (
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">交流紀錄</h2>
      <ol className="space-y-3">
        {shown.map((item) => (
          <li key={item.id} className="flex gap-3 text-sm">
            <span className="w-10 shrink-0 pt-0.5 text-xs text-muted-foreground">{shortDate(item.occurred_on)}</span>
            <span className="flex-1 whitespace-pre-wrap">{item.content}</span>
          </li>
        ))}
      </ol>
      {interactions.length > shown.length ? (
        <p className="text-xs text-muted-foreground">…還有 {interactions.length - shown.length} 筆較舊的紀錄</p>
      ) : null}
    </section>
  );
}
