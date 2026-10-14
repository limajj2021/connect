import type { RoleType } from "@/types/database";

export type GreetingKind = "birthday" | "chinese_new_year" | "dragon_boat" | "mid_autumn" | "hello";

export const GREETING_LABELS: Record<GreetingKind, string> = {
  birthday: "生日祝福",
  chinese_new_year: "新年祝福",
  dragon_boat: "端午祝福",
  mid_autumn: "中秋祝福",
  hello: "近況問候",
};

interface Person {
  name: string;
  title: string | null;
  role_type: RoleType;
}

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
  chinese_new_year: {
    formal: [
      "{稱呼}您好，新春將至，敬祝您新年快樂、闔家平安、鴻圖大展！感謝這一年來的照顧與支持 🧧",
      "{稱呼}新年快樂！祝您新的一年身體健康、事業興隆、萬事如意 🧧",
    ],
    casual: ["{稱呼}新年快樂！🧧 祝你新的一年順順利利、身體健康！", "新年快樂{稱呼}！🧧 新的一年一起加油，有空約～"],
    broadcast: [
      "新春將至，敬祝您新年快樂、闔家平安、萬事如意！感謝這一年來的照顧與支持 🧧",
      "新年快樂！🧧 祝您新的一年身體健康、事業順利、心想事成！",
    ],
  },
  dragon_boat: {
    formal: ["{稱呼}您好，端午佳節將至，敬祝您端午節快樂、闔家安康 🐉", "{稱呼}端午節快樂！祝您身體健康、事業順利 🎋"],
    casual: ["{稱呼}端午節快樂！🐉 記得吃粽子～", "端午快樂{稱呼}！🎋 連假好好休息！"],
    broadcast: ["端午佳節將至，敬祝您端午節快樂、闔家安康 🐉"],
  },
  mid_autumn: {
    formal: ["{稱呼}您好，中秋佳節將至，敬祝您中秋節快樂、月圓人團圓 🌕", "{稱呼}中秋節快樂！祝您闔家團圓、平安喜樂 🥮"],
    casual: ["{稱呼}中秋節快樂！🌕 烤肉吃起來～", "中秋快樂{稱呼}！🥮 祝你跟家人團團圓圓！"],
    broadcast: ["中秋佳節將至，敬祝您中秋節快樂、月圓人團圓 🌕"],
  },
  hello: {
    formal: ["{稱呼}您好，近來一切都好嗎？好一陣子沒向您問候了，有機會再拜訪您。", "{稱呼}您好，最近忙嗎？想跟您約個時間聊聊近況。"],
    casual: ["{稱呼}最近好嗎？好久沒聯絡了，有空一起喝杯咖啡？☕", "嗨{稱呼}！最近在忙什麼？找時間聚聚～"],
    broadcast: ["最近好嗎？好久沒聯絡了，有空一起聚聚！"],
  },
};

const HONORIFIC_RULES: [RegExp, string][] = [
  [/董事長|董事/, "董"],
  [/總經理|總裁|執行長|CEO|總監|副總/i, "總"],
  [/經理/, "經理"],
  [/協理/, "協理"],
  [/律師/, "律師"],
  [/會計師/, "會計師"],
  [/醫師/, "醫師"],
  [/教授/, "教授"],
  [/老師/, "老師"],
];

/** How to address someone: 王董 / 陳總 / 林經理 for bosses, first name otherwise. */
export function salutation(person: Person): string {
  const name = person.name.trim();
  const isCjk = /^[一-鿿]{2,4}$/.test(name);
  if (person.role_type === "boss" || person.title) {
    for (const [re, suffix] of HONORIFIC_RULES) {
      if (person.title && re.test(person.title) && isCjk) return `${name[0]}${suffix}`;
    }
  }
  // A boss with no recognisable title: 王總 is the common, safe address in Taiwan.
  if (person.role_type === "boss") return isCjk ? `${name[0]}總` : name;
  // Casual: 王小明 → 小明; English or 2-char names stay as-is.
  if (isCjk && name.length === 3) return name.slice(1);
  return name;
}

export function greetingVariants(kind: GreetingKind, person: Person | null): string[] {
  const set = TEMPLATES[kind];
  if (!person) return set.broadcast;
  const list = person.role_type === "boss" ? set.formal : set.casual;
  const who = salutation(person);
  return list.map((t) => t.replaceAll("{稱呼}", who));
}

export function greetingText(kind: GreetingKind, person: Person | null, variant = 0): string {
  const variants = greetingVariants(kind, person);
  return variants[((variant % variants.length) + variants.length) % variants.length];
}
