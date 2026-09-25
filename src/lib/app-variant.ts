export type AppVariant = "standard" | "pro" | "tv";

export const APP_VARIANT: AppVariant = ((process.env.NEXT_PUBLIC_APP_VARIANT || "pro").toLowerCase() as AppVariant);

export const isStandardBuild = APP_VARIANT === "standard";
export const isProBuild = APP_VARIANT === "pro";
export const isTvBuild = APP_VARIANT === "tv";

export const isOfflineDownloadsEnabled = isProBuild;
export const isAdSystemEnabled = isStandardBuild;
