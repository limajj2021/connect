"use server";

import Papa from "papaparse";
import { read, utils } from "xlsx";

import { createClient } from "@/lib/supabase/server";

import { syncContactIndustries } from "./actions";

export interface ImportSummary {
  error?: string;
  created?: number;
  skipped?: number;
  skippedReasons?: string[];
}

const MAX_IMPORT_ROWS = 5000;

// Accepts both the Traditional-Chinese labels used by our own CSV export and
// plain English column keys, so a hand-edited or third-party export still works.
const HEADER_ALIASES: Record<string, string> = {
  姓名: "name",
  name: "name",
  英文姓名: "name_en",
  name_en: "name_en",
  公司名稱: "company",
  公司: "company",
  company: "company",
  職稱: "title",
  title: "title",
  身分: "role_type",
  role_type: "role_type",
  產業: "industries",
  industries: "industries",
  國家: "country",
  country: "country",
  城市: "city",
  city: "city",
  電話: "phone",
  phone: "phone",
  email: "email",
  "e-mail": "email",
  "line 顯示名稱": "line_display_name",
  line_display_name: "line_display_name",
  "line id": "line_id",
  line_id: "line_id",
  "line 連結": "line_url",
  line_url: "line_url",
  認識日期: "met_date",
  met_date: "met_date",
  認識管道: "met_channel",
  met_channel: "met_channel",
  "生日（月/日）": "birthday",
  生日: "birthday",
  birthday: "birthday",
  重要人脈: "is_important",
  is_important: "is_important",
  備註: "notes",
  notes: "notes",
};

function normalizeRow(raw: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const mapped = HEADER_ALIASES[key.trim().toLowerCase()];
    if (mapped && value !== undefined && value !== null) {
      normalized[mapped] = String(value).trim();
    }
  }
  return normalized;
}

function parseRoleType(value: string | undefined): "boss" | "non_boss" | "unclassified" {
  if (value === "老闆" || value === "boss") return "boss";
  if (value === "非老闆" || value === "non_boss") return "non_boss";
  return "unclassified";
}

function parseBoolean(value: string | undefined): boolean {
  return value === "是" || value?.toLowerCase() === "true" || value === "1";
}

function parseBirthday(value: string | undefined): { month: number | null; day: number | null } {
  const match = value?.match(/^(\d{1,2})[/\-](\d{1,2})$/);
  if (!match) return { month: null, day: null };
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { month: null, day: null };
  return { month, day };
}

async function parseFile(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const result = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
    return result.data;
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return utils.sheet_to_json<Record<string, unknown>>(firstSheet);
  }
  throw new Error("UNSUPPORTED_FORMAT");
}

export async function importContacts(_prev: ImportSummary, formData: FormData): Promise<ImportSummary> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "請選擇 CSV 或 XLSX 檔案" };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "檔案過大（上限 10MB）" };
  }

  let rawRows: Record<string, unknown>[];
  try {
    rawRows = await parseFile(file);
  } catch {
    return { error: "僅支援 .csv 或 .xlsx 檔案" };
  }

  if (rawRows.length > MAX_IMPORT_ROWS) {
    return { error: `一次最多匯入 ${MAX_IMPORT_ROWS} 筆資料` };
  }

  const supabase = await createClient();
  let created = 0;
  let skipped = 0;
  const skippedReasons: string[] = [];

  for (const raw of rawRows) {
    const row = normalizeRow(raw);
    if (!row.name) {
      skipped += 1;
      if (skippedReasons.length < 10) skippedReasons.push("缺少姓名，已略過一筆");
      continue;
    }

    const { month, day } = parseBirthday(row.birthday);
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        name: row.name,
        name_en: row.name_en || null,
        company: row.company || null,
        title: row.title || null,
        role_type: parseRoleType(row.role_type),
        country: row.country || null,
        city: row.city || null,
        phone: row.phone || null,
        email: row.email || null,
        line_display_name: row.line_display_name || null,
        line_id: row.line_id || null,
        line_url: row.line_url || null,
        met_date: row.met_date || null,
        met_channel: row.met_channel || null,
        birthday_month: month,
        birthday_day: day,
        is_important: parseBoolean(row.is_important),
        notes: row.notes || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      skipped += 1;
      if (skippedReasons.length < 10) skippedReasons.push(`「${row.name}」新增失敗`);
      continue;
    }

    if (row.industries) {
      const industries = row.industries.split(/[、,;]/).map((s) => s.trim()).filter(Boolean);
      if (industries.length > 0) {
        await syncContactIndustries(data.id, industries);
      }
    }

    created += 1;
  }

  return { created, skipped, skippedReasons };
}
