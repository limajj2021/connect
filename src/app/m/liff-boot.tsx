"use client";

import { useEffect } from "react";

import { getLiff } from "@/lib/mini/liff-client";

/** Initialises LIFF early (it also performs LIFF's own deep-link redirect). */
export function LiffBoot() {
  useEffect(() => {
    void getLiff();
  }, []);
  return null;
}
