"use client";

import Script from "next/script";
import { isStandard } from "@/lib/variant";

const adScriptUrl = process.env.NEXT_PUBLIC_STANDARD_MIDROLL_AD_URL?.trim();

export function StandardAdScript() {
  if (!isStandard || !adScriptUrl) return null;
  return <Script src={adScriptUrl} strategy="afterInteractive" />;
}
