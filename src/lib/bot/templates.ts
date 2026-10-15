import { type NamedPerson, salutationFor, toneFor } from "@/lib/contacts/naming";

// "festival" covers every owner-editable greeting occasion (春節, 聖誕節, 跨年,
// or anything else added from the LIFF "節日" page) — one generic template
// interpolated with the occasion's own name, instead of one per festival.
export type GreetingKind = "birthday" | "festival" | "hello";

export const GREETING_LABELS: Record<GreetingKind, string> = {
  birthday: "生日祝福",
  festival: "節日祝福",
  hello: "近況問候",
};

type Person = NamedPerson;

// Each kind has formal (老闆) and casual variants; "換一句" cycles the index.
const TEMPLATES: Record<GreetingKind, { formal: string[]; casual: string[]; broadcast: string[] }> = {
  birthday: {
    formal: [
      "{稱呼}您好，祝您生日快樂！身體健康、事業順利，感謝您一直以來的照顧與支持 🎂",
      "{稱呼}生日快樂！祝您新的一歲平安喜樂、萬事如意，有機會再向您請益 🎉",
    ],
    casual: ["{稱呼}生日快樂！🎂 新的一歲一切順心，有空約吃飯～", "生日快樂{稱呼}！🎉 祝你天天開心、心想事成！"],
    broadcast: ["生日快樂！🎂 祝你新的一歲一切順心！"],
  },
  festival: {
    formal: [
      "{稱呼}您好，{節日}將至，敬祝您{節日}快樂、闔家平安！感謝這段時間的照顧與支持 🎉",
      "{稱呼}{節日}快樂！祝您事業順利、萬事如意 🎉",
    ],
    casual: ["{稱呼}{節日}快樂！🎉 祝你一切順心！", "{節日}快樂{稱呼}！🎉 有空約～"],
    broadcast: ["{節日}將至，敬祝您{節日}快樂！感謝這段時間的照顧與支持 🎉"],
  },
  hello: {
    formal: ["{稱呼}您好，近來一切都好嗎？好一陣子沒向您問候了，有機會再拜訪您。", "{稱呼}您好，最近忙嗎？想跟您約個時間聊聊近況。"],
    casual: ["{稱呼}最近好嗎？好久沒聯絡了，有空一起喝杯咖啡？☕", "嗨{稱呼}！最近在忙什麼？找時間聚聚～"],
    broadcast: ["最近好嗎？好久沒聯絡了，有空一起聚聚！"],
  },
};

/** How to address someone: what you set on the contact, else 王董 / 陳總 / 林經理 for bosses, first name otherwise. */
export function salutation(person: Person): string {
  return salutationFor(person);
}

export function greetingVariants(kind: GreetingKind, person: Person | null, occasionName?: string): string[] {
  const set = TEMPLATES[kind];
  const list = person ? (toneFor(person) === "formal" ? set.formal : set.casual) : set.broadcast;
  const who = person ? salutation(person) : "";
  return list.map((t) => t.replaceAll("{稱呼}", who).replaceAll("{節日}", occasionName ?? "佳節"));
}

export function greetingText(kind: GreetingKind, person: Person | null, variant = 0, occasionName?: string): string {
  const variants = greetingVariants(kind, person, occasionName);
  return variants[((variant % variants.length) + variants.length) % variants.length];
}
