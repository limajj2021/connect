"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email("請輸入有效的 Email"),
  password: z.string().min(1, "請輸入密碼"),
});

export interface LoginState {
  error?: string;
}

export async function signIn(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "輸入資料不正確" };
  }

  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (ownerEmail && parsed.data.email.trim().toLowerCase() !== ownerEmail) {
    return { error: "此帳號未被授權登入" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "帳號或密碼錯誤" };
  }

  redirect("/");
}
